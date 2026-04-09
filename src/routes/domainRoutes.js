const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { ensureAuthenticated } = require('../middlewares/auth');
const pool = require('../config/db');
const { isValidDomain, normalizeDomain } = require('../services/domainValidator');
const { createNslookupJob, getJob, getPublicJobData } = require('../services/reportJobs');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', 'uploads');
const reportsDir = path.join(__dirname, '..', 'reports');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadsDir);
  },
  filename(req, file, cb) {
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    const safeExt = originalExt.slice(0, 10);
    const randomPart = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${randomPart}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

function getUploadedOfficialFiles(req) {
  const files = [];

  if (req.file) {
    files.push(req.file);
  }

  if (req.files && typeof req.files === 'object') {
    if (Array.isArray(req.files.officialFile)) {
      files.push(...req.files.officialFile);
    }

    if (Array.isArray(req.files.officialFiles)) {
      files.push(...req.files.officialFiles);
    }
  }

  return files.filter(Boolean);
}

function removeUploadedFiles(files) {
  for (const file of files) {
    if (file && file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }
}

function setFlash(req, type, text) {
  req.session.flash = { type, text };
}

function redirectWithFlash(req, res, type, text, targetPath) {
  setFlash(req, type, text);

  req.session.save(() => {
    res.redirect(targetPath);
  });
}

function getPublicBaseUrl(req) {
  const fallbackUrl = `${req.protocol}://${req.get('host')}`;
  return String(process.env.PUBLIC_BASE_URL || fallbackUrl).replace(/\/+$/, '');
}

function generateDnsApiTokenValue() {
  return `dnsblk_${crypto.randomBytes(24).toString('hex')}`;
}

function hashDnsApiToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function extractDnsApiToken(req) {
  const authorization = req.get('authorization') || '';
  if (/^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  return (req.get('x-api-token') || '').trim();
}

async function ensureDnsApiToken(req, res, next) {
  const token = extractDnsApiToken(req);

  if (!token) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="DNSBlock DNS"');
    return res.status(401).send('Token de acesso ausente.\n');
  }

  try {
    const tokenHash = hashDnsApiToken(token);
    const result = await pool.query(
      `SELECT id
       FROM dns_api_tokens
       WHERE token_hash = $1
         AND revoked_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="DNSBlock DNS"');
      return res.status(401).send('Token de acesso invalido.\n');
    }

    await pool.query(
      `UPDATE dns_api_tokens
       SET last_used_at = now(),
           last_used_ip = $2
       WHERE id = $1`,
      [result.rows[0].id, req.ip || null]
    );

    return next();
  } catch (error) {
    console.error('Erro ao validar token DNS:', error);
    return res.status(500).send('Erro ao validar autenticacao do endpoint DNS.\n');
  }
}

function getVersionDatePrefix(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function createNextBlocklistVersion(client, changedBy = null, reason = null) {
  const prefix = getVersionDatePrefix();

  const lastVersionResult = await client.query(
    `SELECT version
     FROM blocklist_versions
     ORDER BY id DESC
     LIMIT 1`
  );

  let increment = 0;

  if (lastVersionResult.rows.length > 0) {
    const lastVersion = String(lastVersionResult.rows[0].version || '');
    if (lastVersion.startsWith(prefix)) {
      const suffix = Number.parseInt(lastVersion.slice(8), 10);
      increment = Number.isNaN(suffix) ? 0 : suffix + 1;
    }
  }

  const nextVersion = `${prefix}${String(increment).padStart(2, '0')}`;

  await client.query(
    `INSERT INTO blocklist_versions (version, changed_by, reason)
     VALUES ($1, $2, $3)`,
    [nextVersion, changedBy, reason]
  );

  return nextVersion;
}

async function getOrCreateCurrentBlocklistVersion() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingVersion = await client.query(
      `SELECT version
       FROM blocklist_versions
       ORDER BY id DESC
       LIMIT 1`
    );

    if (existingVersion.rows.length > 0) {
      await client.query('COMMIT');
      return existingVersion.rows[0].version;
    }

    const createdVersion = await createNextBlocklistVersion(client, null, 'initial');
    await client.query('COMMIT');
    return createdVersion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function consumeFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

function renderDomainsForm(res, {
  user,
  message = null,
  error = null,
  inputDomains = '',
  inputNoticeCode = '',
  inputBlockStartDate = '',
  inputBlockEndDate = '',
  invalidDomainsReview = [],
  toast = null,
}) {
  return res.render('domains-new', {
    title: 'Cadastrar Domínios - DNSBlock',
    user,
    message,
    error,
    inputDomains,
    inputNoticeCode,
    inputBlockStartDate,
    inputBlockEndDate,
    invalidDomainsReview,
    toast,
  });
}

async function getInvalidDomainsReview(userId) {
  const result = await pool.query(
    `SELECT original_value, normalized_value, reason, created_at
     FROM domain_import_invalids
     WHERE created_by = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );

  return result.rows;
}

async function getDnsIntegrationViewData(req) {
  const [dnsTokenResult] = await Promise.all([
    pool.query(
      `SELECT id, token_name, token_prefix, created_at, last_used_at
       FROM dns_api_tokens
       WHERE revoked_at IS NULL
       ORDER BY id DESC
       LIMIT 1`
    ),
  ]);

  const generatedDnsApiToken = req.session.generatedDnsApiToken || null;
  delete req.session.generatedDnsApiToken;

  return {
    activeDnsApiToken: dnsTokenResult.rows.length > 0 ? dnsTokenResult.rows[0] : null,
    generatedDnsApiToken,
    dnsEndpointUrls: {
      version: `${getPublicBaseUrl(req)}/dns/version`,
      blocklist: `${getPublicBaseUrl(req)}/dns/blocklist`,
    },
  };
}

router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.redirect('/login');
});

router.get('/dashboard', ensureAuthenticated, async (req, res) => {
  const toast = consumeFlash(req);

  try {
    const [{ rows: totalsRows }, { rows: blockedRows }] = await Promise.all([
      pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE is_active = true) AS total_count,
            COUNT(*) FILTER (WHERE is_active = true AND notice_id IS NOT NULL) AS with_notice_count,
            COUNT(*) FILTER (WHERE is_active = true AND notice_id IS NULL) AS without_notice_count
         FROM domains
         `
      ),
      pool.query(
        `SELECT * FROM (
          SELECT
              d.id,
              d.domain_name,
              d.is_active,
              COALESCE(last_exec.executed_at, d.blocked_at, d.created_at) AS executed_at,
              n.id AS notice_id,
              n.notice_code,
              n.original_file_name
           FROM notices n
           LEFT JOIN domains d ON d.notice_id = n.id
           LEFT JOIN LATERAL (
             SELECT executed_at
             FROM domain_executions
             WHERE domain_id = d.id
             ORDER BY executed_at DESC
             LIMIT 1
           ) last_exec ON true
           
           UNION ALL
           
           SELECT
              d.id,
              d.domain_name,
              d.is_active,
              COALESCE(last_exec.executed_at, d.blocked_at, d.created_at) AS executed_at,
              NULL AS notice_id,
              'Sem ofício' AS notice_code,
              NULL AS original_file_name
           FROM domains d
           LEFT JOIN LATERAL (
             SELECT executed_at
             FROM domain_executions
             WHERE domain_id = d.id
             ORDER BY executed_at DESC
             LIMIT 1
           ) last_exec ON true
           WHERE d.notice_id IS NULL
         ) combined
         ORDER BY notice_code, executed_at DESC
         LIMIT 2000`
      ),
    ]);

    const groupsMap = new Map();
    const allRows = Array.from(blockedRows);
    
    // Iterar sobre os rows para criar grupos e adicionar domínios ativos
    for (const row of allRows) {
      // Criar o grupo baseado em notice_id/notice_code (mesmo se não houver domínio)
      const key = row.notice_id ? `notice-${row.notice_id}` : 'without-notice';
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          noticeId: row.notice_id || null,
          noticeCode: row.notice_code || 'Sem ofício',
          fileName: row.original_file_name || null,
          domains: [],
        });
      }
      
      // Adicionar domínio apenas se ele existe (row.id não é null) e está ativo
      if (row.id && row.is_active === true) {
        groupsMap.get(key).domains.push({
          domainName: row.domain_name,
          executedAt: row.executed_at,
        });
      }
    }

    const blockedGroups = Array.from(groupsMap.values());

    // Contar ofícios (grupos) separando os sem ofício
    const totalNotices = blockedGroups.filter(g => g.noticeId !== null).length;

    return res.render('dashboard', {
      title: 'Dashboard - DNSBlock',
      user: req.session.user,
      totals: { ...totalsRows[0], total_notices: totalNotices },
      blockedGroups,
      message: null,
      error: null,
      toast,
    });
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    return res.status(500).render('dashboard', {
      title: 'Dashboard - DNSBlock',
      user: req.session.user,
      totals: { total_count: 0, with_notice_count: 0, without_notice_count: 0, total_notices: 0 },
      blockedGroups: [],
      message: null,
      error: 'Erro interno ao carregar dashboard.',
      toast,
    });
  }
});

router.get('/dns/integration', ensureAuthenticated, async (req, res) => {
  const toast = consumeFlash(req);

  try {
    const viewData = await getDnsIntegrationViewData(req);

    return res.render('dns-integration', {
      title: 'Integração DNS - DNSBlock',
      user: req.session.user,
      message: null,
      error: null,
      toast,
      ...viewData,
    });
  } catch (error) {
    console.error('Erro ao carregar página de integração DNS:', error);
    return res.status(500).render('dns-integration', {
      title: 'Integração DNS - DNSBlock',
      user: req.session.user,
      activeDnsApiToken: null,
      generatedDnsApiToken: null,
      dnsEndpointUrls: {
        version: `${getPublicBaseUrl(req)}/dns/version`,
        blocklist: `${getPublicBaseUrl(req)}/dns/blocklist`,
      },
      message: null,
      error: 'Erro interno ao carregar a integração DNS.',
      toast,
    });
  }
});

router.get('/reports/nslookup', ensureAuthenticated, async (req, res) => {
  const toast = consumeFlash(req);
  let reportJob = null;

  if (req.session.nslookupReportJobId) {
    const currentJob = getJob(req.session.nslookupReportJobId);
    if (currentJob) {
      reportJob = getPublicJobData(currentJob);
    } else {
      delete req.session.nslookupReportJobId;
    }
  }

  try {
    const [versionResult, reportResult] = await Promise.all([
      pool.query(
        `SELECT version
         FROM blocklist_versions
         ORDER BY id DESC
         LIMIT 1`
      ),
      pool.query(
        `SELECT job_id, blocklist_version, status, progress, total, processed, report_file_name, error, updated_at
         FROM blocklist_reports
         ORDER BY id DESC
         LIMIT 1`
      ),
    ]);

    let latestBlocklistVersion = versionResult.rows.length > 0 ? versionResult.rows[0].version : null;
    let latestReport = reportResult.rows.length > 0 ? reportResult.rows[0] : null;

    // If there is no active in-memory job, expose the latest completed report of the current version.
    if (!reportJob && latestReport && latestBlocklistVersion && latestReport.blocklist_version === latestBlocklistVersion) {
      reportJob = {
        id: latestReport.job_id,
        status: latestReport.status,
        progress: Number(latestReport.progress || 0),
        total: Number(latestReport.total || 0),
        processed: Number(latestReport.processed || 0),
        error: latestReport.error || null,
        reportFileName: latestReport.report_file_name || null,
      };
    }

    return res.render('reports-nslookup', {
      title: 'Relatórios - DNSBlock',
      user: req.session.user,
      reportJob,
      latestBlocklistVersion,
      latestReport,
      message: null,
      error: null,
      toast,
    });
  } catch (error) {
    console.error('Erro ao carregar página de relatórios:', error);
    return res.status(500).render('reports-nslookup', {
      title: 'Relatórios - DNSBlock',
      user: req.session.user,
      reportJob,
      latestBlocklistVersion: null,
      latestReport: null,
      message: null,
      error: 'Erro interno ao carregar a página de relatórios.',
      toast,
    });
  }
});

router.get('/domains/new', ensureAuthenticated, (req, res) => {
  const toast = consumeFlash(req);
  return getInvalidDomainsReview(req.session.user.id)
    .then((invalidDomainsReview) => {
      return renderDomainsForm(res, {
        user: req.session.user,
        message: null,
        error: null,
        inputDomains: '',
        inputNoticeCode: '',
        inputBlockStartDate: '',
        inputBlockEndDate: '',
        invalidDomainsReview,
        toast,
      });
    })
    .catch((error) => {
      console.error('Erro ao carregar domínios inválidos para revisão:', error);
      return renderDomainsForm(res, {
        user: req.session.user,
        message: null,
        error: null,
        inputDomains: '',
        inputNoticeCode: '',
        inputBlockStartDate: '',
        inputBlockEndDate: '',
        invalidDomainsReview: [],
        toast,
      });
    });
});

router.post(
  '/domains',
  ensureAuthenticated,
  upload.fields([
    { name: 'officialFile', maxCount: 10 },
    { name: 'officialFiles', maxCount: 10 },
  ]),
  async (req, res) => {
  const input = req.body.domains || '';
  const noticeCode = (req.body.noticeCode || '').trim();
  const blockStartDate = (req.body.blockStartDate || '').trim();
  const blockEndDate = (req.body.blockEndDate || '').trim();
  const uploadedFiles = getUploadedOfficialFiles(req);

  if (!input.trim()) {
    return res.status(400).render('domains-new', {
      title: 'Cadastrar Domínios - DNSBlock',
      user: req.session.user,
      message: null,
      error: 'Informe ao menos um domínio.',
      inputDomains: '',
      inputNoticeCode: noticeCode,
      inputBlockStartDate: blockStartDate,
      inputBlockEndDate: blockEndDate,
      invalidDomainsReview: [],
      toast: null,
    });
  }

  if (blockStartDate && Number.isNaN(Date.parse(blockStartDate))) {
    return res.status(400).render('domains-new', {
      title: 'Cadastrar Domínios - DNSBlock',
      user: req.session.user,
      message: null,
      error: 'Data inicial de bloqueio inválida.',
      inputDomains: input,
      inputNoticeCode: noticeCode,
      inputBlockStartDate: blockStartDate,
      inputBlockEndDate: blockEndDate,
      invalidDomainsReview: [],
      toast: null,
    });
  }

  if (blockEndDate && Number.isNaN(Date.parse(blockEndDate))) {
    return res.status(400).render('domains-new', {
      title: 'Cadastrar Domínios - DNSBlock',
      user: req.session.user,
      message: null,
      error: 'Data final de bloqueio inválida.',
      inputDomains: input,
      inputNoticeCode: noticeCode,
      inputBlockStartDate: blockStartDate,
      inputBlockEndDate: blockEndDate,
      invalidDomainsReview: [],
      toast: null,
    });
  }

  if (blockStartDate && blockEndDate && blockEndDate < blockStartDate) {
    return res.status(400).render('domains-new', {
      title: 'Cadastrar Domínios - DNSBlock',
      user: req.session.user,
      message: null,
      error: 'Data final não pode ser menor que a data inicial.',
      inputDomains: input,
      inputNoticeCode: noticeCode,
      inputBlockStartDate: blockStartDate,
      inputBlockEndDate: blockEndDate,
      invalidDomainsReview: [],
      toast: null,
    });
  }

  const parsedLines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((originalValue) => {
      const normalizedValue = normalizeDomain(originalValue);
      return { originalValue, normalizedValue };
    });

  const invalidItems = [];
  const validNormalizedDomains = [];

  for (const item of parsedLines) {
    if (!item.normalizedValue) {
      invalidItems.push({
        originalValue: item.originalValue,
        normalizedValue: null,
        reason: 'Sem caracteres válidos após limpeza.',
      });
      continue;
    }

    if (!isValidDomain(item.normalizedValue)) {
      invalidItems.push({
        originalValue: item.originalValue,
        normalizedValue: item.normalizedValue,
        reason: 'Formato inválido. Exemplo válido: bet.jogo.com.',
      });
      continue;
    }

    validNormalizedDomains.push(item.normalizedValue);
  }

  try {
    const totalValidNormalized = validNormalizedDomains.length;
    const uniqueDomains = [...new Set(validNormalizedDomains)];
    const duplicatedInPayload = totalValidNormalized - uniqueDomains.length;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existingResult = await client.query(
        `SELECT domain_name, is_active
         FROM domains
         WHERE domain_name = ANY($1::varchar[])`,
        [uniqueDomains]
      );

      const activeDomainsSet = new Set(
        existingResult.rows.filter((row) => row.is_active).map((row) => row.domain_name)
      );
      const inactiveDomainsSet = new Set(
        existingResult.rows.filter((row) => !row.is_active).map((row) => row.domain_name)
      );

      const newDomains = uniqueDomains.filter(
        (domain) => !activeDomainsSet.has(domain) && !inactiveDomainsSet.has(domain)
      );
      const reactivatedDomains = uniqueDomains.filter((domain) => inactiveDomainsSet.has(domain));
      const ignoredAlreadyRegistered = uniqueDomains.filter((domain) => activeDomainsSet.has(domain)).length;
      const ignoredTotal = ignoredAlreadyRegistered + duplicatedInPayload + invalidItems.length;
      const hasNoticeInfo = Boolean(noticeCode || uploadedFiles.length > 0);

      let noticeId = null;

      if (hasNoticeInfo && newDomains.length + reactivatedDomains.length > 0) {
        const primaryFile = uploadedFiles[0] || null;

        const noticeInsert = await client.query(
          `INSERT INTO notices (
              notice_code,
              original_file_name,
              stored_file_name,
              mime_type,
              file_size,
              uploaded_by
            )
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            noticeCode || null,
            primaryFile ? primaryFile.originalname : null,
            primaryFile ? primaryFile.filename : null,
            primaryFile ? primaryFile.mimetype : null,
            primaryFile ? primaryFile.size : null,
            req.session.user.id,
          ]
        );

        noticeId = noticeInsert.rows[0].id;

        for (const file of uploadedFiles) {
          await client.query(
            `INSERT INTO notice_files (
                notice_id,
                original_file_name,
                stored_file_name,
                mime_type,
                file_size,
                uploaded_by
              )
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              noticeId,
              file.originalname || null,
              file.filename || null,
              file.mimetype || null,
              file.size || null,
              req.session.user.id,
            ]
          );
        }
      }

      for (const domain of newDomains) {
        const insertDomainResult = await client.query(
          `INSERT INTO domains (
              domain_name,
              status,
              created_by,
              notice_id,
              block_start_date,
              block_end_date
            )
           VALUES ($1, 'blocked', $2, $3, $4, $5)
           ON CONFLICT (domain_name) DO NOTHING
           RETURNING id`,
          [
            domain,
            req.session.user.id,
            noticeId,
            blockStartDate || null,
            blockEndDate || null,
          ]
        );

        if (insertDomainResult.rows.length > 0) {
          await client.query(
            `INSERT INTO domain_executions (domain_id, executed_by, executed_at)
             VALUES ($1, $2, now())`,
            [insertDomainResult.rows[0].id, req.session.user.id]
          );

          await client.query(
            `UPDATE domains
             SET blocked_at = now(),
                 updated_at = now()
             WHERE id = $1`,
            [insertDomainResult.rows[0].id]
          );
        }
      }

      for (const domain of reactivatedDomains) {
        const updateDomainResult = await client.query(
          `UPDATE domains
           SET is_active = true,
               status = 'blocked',
               notice_id = CASE
                 WHEN $2::BIGINT IS NOT NULL THEN $2
                 ELSE notice_id
               END,
               block_start_date = CASE
                 WHEN $3::DATE IS NOT NULL THEN $3
                 ELSE block_start_date
               END,
               block_end_date = CASE
                 WHEN $4::DATE IS NOT NULL THEN $4
                 ELSE block_end_date
               END,
               blocked_at = now(),
               updated_at = now()
           WHERE domain_name = $1
             AND is_active = false
           RETURNING id`,
          [
            domain,
            noticeId,
            blockStartDate || null,
            blockEndDate || null,
          ]
        );

        if (updateDomainResult.rows.length > 0) {
          await client.query(
            `INSERT INTO domain_executions (domain_id, executed_by, executed_at)
             VALUES ($1, $2, now())`,
            [updateDomainResult.rows[0].id, req.session.user.id]
          );
        }
      }

      if (newDomains.length > 0 || reactivatedDomains.length > 0) {
        await createNextBlocklistVersion(client, req.session.user.id, 'insert-domains');
      }

      for (const invalidItem of invalidItems) {
        await client.query(
          `INSERT INTO domain_import_invalids (
              original_value,
              normalized_value,
              reason,
              created_by
            )
           VALUES ($1, $2, $3, $4)`,
          [
            invalidItem.originalValue,
            invalidItem.normalizedValue,
            invalidItem.reason,
            req.session.user.id,
          ]
        );
      }

      await client.query('COMMIT');

      if (uploadedFiles.length > 0 && hasNoticeInfo && newDomains.length + reactivatedDomains.length === 0) {
        removeUploadedFiles(uploadedFiles);
      }

      setFlash(
        req,
        'success',
        `Envio concluído. Domínios novos: ${newDomains.length}. Domínios reativados: ${reactivatedDomains.length}. Domínios ignorados: ${ignoredTotal} (já cadastrados, duplicados ou inválidos para revisão).`
      );
    } catch (transactionError) {
      await client.query('ROLLBACK');
      removeUploadedFiles(uploadedFiles);
      throw transactionError;
    } finally {
      client.release();
    }

    return res.redirect('/domains/new');
  } catch (error) {
    console.error('Erro ao cadastrar domínios:', error);
    return res.status(500).render('domains-new', {
      title: 'Cadastrar Domínios - DNSBlock',
      user: req.session.user,
      message: null,
      error: 'Erro interno ao cadastrar domínios.',
      inputDomains: input,
      inputNoticeCode: noticeCode,
      inputBlockStartDate: blockStartDate,
      inputBlockEndDate: blockEndDate,
      invalidDomainsReview: [],
      toast: null,
    });
  }
}
);

router.get('/notices/:id/download', ensureAuthenticated, async (req, res) => {
  const noticeId = Number(req.params.id);

  if (!Number.isInteger(noticeId) || noticeId <= 0) {
    return res.status(400).send('Ofício inválido.');
  }

  try {
    const result = await pool.query(
      `SELECT original_file_name, stored_file_name, mime_type
       FROM notices
       WHERE id = $1`,
      [noticeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Ofício não encontrado.');
    }

    const notice = result.rows[0];

    if (!notice.stored_file_name) {
      return res.status(404).send('Este ofício não possui arquivo anexado.');
    }

    const filePath = path.join(uploadsDir, notice.stored_file_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Arquivo de ofício não encontrado no servidor.');
    }

    if (notice.mime_type) {
      res.setHeader('Content-Type', notice.mime_type);
    }

    return res.download(filePath, notice.original_file_name || notice.stored_file_name);
  } catch (error) {
    console.error('Erro ao baixar ofício:', error);
    return res.status(500).send('Erro interno ao baixar ofício.');
  }
});

router.get('/dns/blocklist', async (req, res) => {
  return ensureDnsApiToken(req, res, async () => {
  try {
    const result = await pool.query(
      `SELECT domain_name
       FROM domains
       WHERE is_active = true
       ORDER BY domain_name ASC`
    );

    const lines = result.rows.map((row) => `local-zone: "${row.domain_name}" always_nxdomain`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(lines.join('\n'));
  } catch (error) {
    console.error('Erro ao gerar lista de bloqueio para DNS:', error);
    return res.status(500).send('Erro ao gerar lista de bloqueio.');
  }
  });
});

router.get('/dns/version', async (req, res) => {
  return ensureDnsApiToken(req, res, async () => {
  try {
    const currentVersion = await getOrCreateCurrentBlocklistVersion();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(`${currentVersion}\n`);
  } catch (error) {
    console.error('Erro ao obter versão da blocklist:', error);
    return res.status(500).send('Erro ao obter versão da blocklist.');
  }
  });
});

router.post('/dns/tokens/generate', ensureAuthenticated, async (req, res) => {
  const plainToken = generateDnsApiTokenValue();
  const tokenHash = hashDnsApiToken(plainToken);
  const tokenPrefix = plainToken.slice(0, 18);

  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE dns_api_tokens
         SET revoked_at = now(),
             revoked_by = $1
         WHERE revoked_at IS NULL`,
        [req.session.user.id]
      );

      await client.query(
        `INSERT INTO dns_api_tokens (token_name, token_hash, token_prefix, created_by)
         VALUES ($1, $2, $3, $4)`,
        ['DNS Export', tokenHash, tokenPrefix, req.session.user.id]
      );

      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

    req.session.generatedDnsApiToken = plainToken;
    return redirectWithFlash(req, res, 'success', 'Novo token DNS gerado. Copie e atualize o servidor BIND agora.', '/dns/integration');
  } catch (error) {
    console.error('Erro ao gerar token DNS:', error);
    return redirectWithFlash(req, res, 'error', 'Erro ao gerar token DNS.', '/dns/integration');
  }
});

router.post('/dns/tokens/revoke', ensureAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE dns_api_tokens
       SET revoked_at = now(),
           revoked_by = $1
       WHERE revoked_at IS NULL`,
      [req.session.user.id]
    );

    if (result.rowCount === 0) {
      return redirectWithFlash(req, res, 'info', 'Nenhum token DNS ativo para revogar.', '/dns/integration');
    }

    delete req.session.generatedDnsApiToken;
    return redirectWithFlash(req, res, 'success', 'Token DNS revogado com sucesso.', '/dns/integration');
  } catch (error) {
    console.error('Erro ao revogar token DNS:', error);
    return redirectWithFlash(req, res, 'error', 'Erro ao revogar token DNS.', '/dns/integration');
  }
});

router.post('/reports/nslookup/start', ensureAuthenticated, async (req, res) => {
  try {
    const currentVersion = await getOrCreateCurrentBlocklistVersion();

    const reportForCurrentVersion = await pool.query(
      `SELECT id, job_id, status, blocklist_version
       FROM blocklist_reports
       WHERE blocklist_version = $1
       ORDER BY id DESC
       LIMIT 1`,
      [currentVersion]
    );

    if (reportForCurrentVersion.rows.length > 0) {
      const existingReport = reportForCurrentVersion.rows[0];
      if (existingReport.status === 'completed') {
        req.session.nslookupReportJobId = existingReport.job_id;
        return redirectWithFlash(
          req,
          res,
          'info',
          `Ja existe relatorio concluido para a versao ${currentVersion}. Gere um novo apenas apos mudanca de versao.`,
          '/dashboard'
        );
      }

      if (existingReport.status === 'queued' || existingReport.status === 'running') {
        req.session.nslookupReportJobId = existingReport.job_id;
        return redirectWithFlash(
          req,
          res,
          'info',
          `Ja existe relatorio em execucao para a versao ${currentVersion}.`,
          '/dashboard'
        );
      }
    }

    const existingJobId = req.session.nslookupReportJobId;
    if (existingJobId) {
      const existingJob = getJob(existingJobId);
      if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'running')) {
        return redirectWithFlash(req, res, 'info', 'Ja existe um relatorio em execucao. Aguarde a conclusao.', '/dashboard');
      }
    }

    const domainsResult = await pool.query(
      `SELECT domain_name
       FROM domains
       WHERE is_active = true
       ORDER BY domain_name ASC`
    );

    const domains = domainsResult.rows.map((row) => row.domain_name);

    if (domains.length === 0) {
      return redirectWithFlash(req, res, 'info', 'Nao ha dominios ativos para gerar o relatorio.', '/dashboard');
    }

    const job = createNslookupJob(domains, req.session.user.username, {
      onStart: (jobState) => {
        pool
          .query(
            `UPDATE blocklist_reports
             SET status = 'running',
                 progress = $2,
                 processed = $3,
                 total = $4,
                 updated_at = now()
             WHERE job_id = $1`,
            [jobState.id, jobState.progress, jobState.processed, jobState.total]
          )
          .catch((err) => console.error('Erro ao atualizar status running do relatório:', err));
      },
      onProgress: (jobState) => {
        pool
          .query(
            `UPDATE blocklist_reports
             SET progress = $2,
                 processed = $3,
                 total = $4,
                 updated_at = now()
             WHERE job_id = $1`,
            [jobState.id, jobState.progress, jobState.processed, jobState.total]
          )
          .catch((err) => console.error('Erro ao atualizar progresso do relatório:', err));
      },
      onComplete: (jobState) => {
        pool
          .query(
            `UPDATE blocklist_reports
             SET status = 'completed',
                 progress = 100,
                 processed = $3,
                 total = $4,
                 report_file_name = $2,
                 updated_at = now()
             WHERE job_id = $1`,
            [jobState.id, jobState.reportFileName, jobState.processed, jobState.total]
          )
          .catch((err) => console.error('Erro ao finalizar relatório:', err));
      },
      onError: (jobState) => {
        pool
          .query(
            `UPDATE blocklist_reports
             SET status = 'failed',
                 error = $2,
                 updated_at = now()
             WHERE job_id = $1`,
            [jobState.id, jobState.error || 'Falha ao gerar relatório.']
          )
          .catch((err) => console.error('Erro ao marcar falha do relatório:', err));
      },
    });

    await pool.query(
      `INSERT INTO blocklist_reports (
          job_id,
          blocklist_version,
          status,
          progress,
          total,
          processed,
          requested_by
        )
       VALUES ($1, $2, 'queued', 0, $3, 0, $4)`,
      [job.id, currentVersion, job.total, req.session.user.id]
    );

    req.session.nslookupReportJobId = job.id;

    return redirectWithFlash(
      req,
      res,
      'success',
      'Relatorio iniciado em background. Acompanhe o progresso no dashboard.',
      '/dashboard'
    );
  } catch (error) {
    console.error('Erro ao iniciar relatorio nslookup:', error);
    return redirectWithFlash(req, res, 'error', 'Erro ao iniciar relatorio de verificacao.', '/dashboard');
  }
});

router.get('/reports/nslookup/status', ensureAuthenticated, (req, res) => {
  const jobId = req.query.jobId || req.session.nslookupReportJobId;

  if (!jobId) {
    return res.json({ status: 'idle', progress: 0 });
  }

  const job = getJob(jobId);
  if (!job) {
    pool
      .query(
        `SELECT job_id, status, progress, total, processed, error, report_file_name
         FROM blocklist_reports
         WHERE job_id = $1
         LIMIT 1`,
        [jobId]
      )
      .then((result) => {
        if (result.rows.length === 0) {
          return res.json({ status: 'idle', progress: 0 });
        }

        const row = result.rows[0];
        return res.json({
          id: row.job_id,
          status: row.status,
          progress: row.progress,
          total: row.total,
          processed: row.processed,
          error: row.error,
          reportFileName: row.report_file_name,
        });
      })
      .catch((error) => {
        console.error('Erro ao consultar status do relatório no banco:', error);
        return res.json({ status: 'idle', progress: 0 });
      });
    return;
  }

  return res.json(getPublicJobData(job));
});

router.get('/reports/nslookup/download', ensureAuthenticated, (req, res) => {
  const jobId = req.query.jobId || req.session.nslookupReportJobId;

  if (!jobId) {
    return res.status(404).send('Relatorio nao encontrado.');
  }

  const job = getJob(jobId);

  // Fast path: current in-memory job completed.
  if (job && job.status === 'completed' && job.reportPath && fs.existsSync(job.reportPath)) {
    return res.download(job.reportPath, job.reportFileName || 'dns-report.pdf');
  }

  // Fallback: resolve from persisted report metadata (works after app restart).
  return pool
    .query(
      `SELECT status, report_file_name
       FROM blocklist_reports
       WHERE job_id = $1
       LIMIT 1`,
      [jobId]
    )
    .then((result) => {
      if (result.rows.length === 0) {
        return res.status(404).send('Relatorio nao encontrado.');
      }

      const row = result.rows[0];
      if (row.status !== 'completed' || !row.report_file_name) {
        return res.status(400).send('Relatorio ainda nao esta pronto para download.');
      }

      const reportPath = path.join(reportsDir, row.report_file_name);
      if (!fs.existsSync(reportPath)) {
        return res.status(404).send('Arquivo do relatorio nao encontrado.');
      }

      return res.download(reportPath, row.report_file_name);
    })
    .catch((error) => {
      console.error('Erro ao baixar relatorio persistido:', error);
      return res.status(500).send('Erro ao baixar relatorio.');
    });
});

router.post('/domains/execute-block', ensureAuthenticated, async (req, res) => {
  setFlash(req, 'info', 'Os domínios agora são bloqueados automaticamente no cadastro.');
  return res.redirect('/dashboard');
});

router.post('/domains/delete/by-domain', ensureAuthenticated, async (req, res) => {
  const domainInput = req.body.domainName || '';
  const normalizedDomain = normalizeDomain(domainInput);

  if (!normalizedDomain || !isValidDomain(normalizedDomain)) {
    setFlash(req, 'error', 'Informe um domínio válido para exclusão.');
    return res.redirect('/dashboard');
  }

  try {
    const client = await pool.connect();

    let result;

    try {
      await client.query('BEGIN');

      result = await client.query(
        `UPDATE domains
         SET is_active = false,
             updated_at = now()
         WHERE domain_name = $1
           AND is_active = true`,
        [normalizedDomain]
      );

      if (result.rowCount > 0) {
        await createNextBlocklistVersion(client, req.session.user.id, 'delete-by-domain');
      }

      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

    if (result.rowCount === 0) {
      setFlash(req, 'info', `Nenhum domínio ativo encontrado com o nome ${normalizedDomain}.`);
      return res.redirect('/dashboard');
    }

    setFlash(req, 'success', `Domínio ${normalizedDomain} excluído com sucesso.`);
    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro ao excluir domínio por nome:', error);
    setFlash(req, 'error', 'Erro ao excluir domínio por nome.');
    return res.redirect('/dashboard');
  }
});

router.post('/domains/delete/by-notice', ensureAuthenticated, async (req, res) => {
  const noticeCode = (req.body.noticeCode || '').trim();

  if (!noticeCode) {
    setFlash(req, 'error', 'Informe o número do ofício para exclusão.');
    return res.redirect('/dashboard');
  }

  try {
    const client = await pool.connect();

    let result;

    try {
      await client.query('BEGIN');

      result = await client.query(
        `UPDATE domains d
         SET is_active = false,
             updated_at = now()
         FROM notices n
         WHERE d.notice_id = n.id
           AND d.is_active = true
           AND lower(n.notice_code) = lower($1)`,
        [noticeCode]
      );

      if (result.rowCount > 0) {
        await createNextBlocklistVersion(client, req.session.user.id, 'delete-by-notice');
      }

      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

    if (result.rowCount === 0) {
      setFlash(req, 'info', `Nenhum domínio ativo encontrado para o ofício ${noticeCode}.`);
      return res.redirect('/dashboard');
    }

    setFlash(req, 'success', `Exclusão concluída. ${result.rowCount} domínio(s) removido(s) do ofício ${noticeCode}.`);
    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro ao excluir domínios por ofício:', error);
    setFlash(req, 'error', 'Erro ao excluir domínios por ofício.');
    return res.redirect('/dashboard');
  }
});

router.post('/domains/delete/all', ensureAuthenticated, async (req, res) => {
  try {
    const client = await pool.connect();

    let result;

    try {
      await client.query('BEGIN');

      result = await client.query(
        `UPDATE domains
         SET is_active = false,
             updated_at = now()
         WHERE is_active = true`
      );

      if (result.rowCount > 0) {
        await createNextBlocklistVersion(client, req.session.user.id, 'delete-all');
      }

      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }

    if (result.rowCount === 0) {
      setFlash(req, 'info', 'Nenhum domínio ativo para excluir.');
      return res.redirect('/dashboard');
    }

    setFlash(req, 'success', `Exclusão concluída. ${result.rowCount} domínio(s) removido(s) da blocklist.`);
    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro ao excluir todos os domínios:', error);
    setFlash(req, 'error', 'Erro ao excluir todos os domínios.');
    return res.redirect('/dashboard');
  }
});

module.exports = router;
