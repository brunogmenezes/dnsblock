
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { ensureAuthenticated, ensurePermission } = require('../middlewares/auth');
const pool = require('../config/db');
const { isValidDomain, normalizeDomain } = require('../services/domainValidator');
const { createNslookupJob, getJob, getPublicJobData } = require('../services/reportJobs');
const { logAudit } = require('../services/auditLogger');

const router = express.Router();

// Adiciona domínios a um ofício e retorna JSON com o resultado
router.post('/notices/add-domains', ensurePermission('notices.add_domains'), async (req, res) => {
  const noticeId = Number(req.body.noticeId);
  const domainsRaw = req.body.domains || '';
  const userId = req.session.user.id;
  
  if (!noticeId || !domainsRaw.trim()) {
    return res.status(400).json({ error: 'Informe os domínios para bloquear.' });
  }

  try {
    // Verifica se o ofício já foi informado
    const noticeCheck = await pool.query("SELECT status FROM notices WHERE id = $1", [noticeId]);
    if (noticeCheck.rows.length > 0 && noticeCheck.rows[0].status === 'informed') {
      return res.status(403).json({ error: 'Não é permitido adicionar domínios a um ofício já respondido.' });
    }

    const lines = domainsRaw.split(/\r?\n/).map(d => d.trim()).filter(Boolean);
    if (lines.length === 0) {
      return res.status(400).json({ error: 'Nenhum domínio válido informado.' });
    }

    let validCount = 0;
    let invalidCount = 0;
    let registeredCount = 0;

    for (const line of lines) {
      if (!isValidDomain(line)) {
        invalidCount++;
        // Continua registrando os inválidos no banco para revisão, se desejar, mas ignora na inserção final
        await pool.query(
          `INSERT INTO domain_import_invalids (original_value, normalized_value, reason, created_by)
           VALUES ($1, $2, $3, $4)`,
          [line, normalizeDomain(line), 'Formato de domínio inválido', userId]
        );
        continue;
      }

      const domain = normalizeDomain(line);
      
      const insertResult = await pool.query(
        `INSERT INTO domains (domain_name, status, blocked_at, notice_id, is_active, created_by)
         VALUES ($1, 'blocked', now(), $2, true, $3)
         ON CONFLICT (domain_name) DO NOTHING
         RETURNING id`,
        [domain, noticeId, userId]
      );
      
      if (insertResult.rowCount === 0) {
        registeredCount++;
      } else {
        validCount++;
      }
    }

    // Se houve inserção de domínios válidos, atualiza o status do ofício para 'blocked'
    if (validCount > 0) {
      await pool.query(
        "UPDATE notices SET status = 'blocked' WHERE id = $1 AND status = 'registered'",
        [noticeId]
      );
    }

      await logAudit(pool, {
        req,
        action: 'notices.add_domains',
        details: {
          noticeId,
          validCount,
          invalidCount,
          registeredCount,
          statusUpdatedTo: validCount > 0 ? 'blocked' : null
        },
      });

      return res.json({
        success: true,
        validCount,
        invalidCount,
        registeredCount
      });
    } catch (error) {
      console.error('Erro ao adicionar domínios:', error);
      return res.status(500).json({ error: 'Erro interno ao processar domínios.' });
    }
  }
);

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
    title: 'Ofícios - DNSBlock',
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

async function getInvalidDomainsReview(userId, { page = 1, pageSize = 10, search = '' } = {}) {
  const offset = (page - 1) * pageSize;
  let where = 'created_by = $1';
  let params = [userId];
  if (search) {
    where += ' AND (original_value ILIKE $2 OR normalized_value ILIKE $2 OR reason ILIKE $2)';
    params.push(`%${search}%`);
  }
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM domain_import_invalids WHERE ${where}`,
    params
  );
  const total = Number(countResult.rows[0].count);
  const dataResult = await pool.query(
    `SELECT original_value, normalized_value, reason, created_at
     FROM domain_import_invalids
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  return {
    rows: dataResult.rows,
    total,
    page,
    pageSize,
    search,
    totalPages: Math.ceil(total / pageSize)
  };
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

router.get('/api/notices', ensurePermission('dashboard'), async (req, res) => {
  const search = (req.query.search || '').trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 10);
  const offset = (page - 1) * limit;

  try {
    let where = '1=1';
    let params = [];
    if (search) {
      where += ' AND notice_code ILIKE $1';
      params.push(`%${search}%`);
    }

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, notice_code, created_at, status,
                (SELECT COUNT(*) FROM domains WHERE notice_id = notices.id AND is_active = true) as active_domains
         FROM notices
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM notices WHERE ${where}`, params)
    ]);

    res.json({
      notices: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    });
  } catch (error) {
    console.error('Erro na API de ofícios:', error);
    res.status(500).json({ error: 'Erro ao buscar ofícios' });
  }
});

router.get('/api/notices/:id/domains', ensurePermission('dashboard'), async (req, res) => {
  const noticeId = req.params.id === 'null' ? null : parseInt(req.params.id);
  const search = (req.query.search || '').trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;

  try {
    let where = noticeId === null ? 'notice_id IS NULL' : 'notice_id = $1';
    let params = noticeId === null ? [] : [noticeId];

    if (search) {
      where += ` AND domain_name ILIKE $${params.length + 1}`;
      params.push(`%${search}%`);
    }

    where += ' AND is_active = true';

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT d.id, d.domain_name, d.blocked_at as created_at,
                COALESCE((SELECT executed_at FROM domain_executions WHERE domain_id = d.id ORDER BY executed_at DESC LIMIT 1), d.blocked_at) as executed_at
         FROM domains d
         WHERE ${where}
         ORDER BY d.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM domains WHERE ${where}`, params)
    ]);

    res.json({
      domains: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    });
  } catch (error) {
    console.error('Erro na API de domínios por ofício:', error);
    res.status(500).json({ error: 'Erro ao buscar domínios' });
  }
});

router.get('/api/domains/global', ensurePermission('dashboard'), async (req, res) => {
  const search = (req.query.search || '').trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 10);
  const offset = (page - 1) * limit;

  try {
    let where = 'd.is_active = true';
    let params = [];
    if (search) {
      where += ' AND d.domain_name ILIKE $1';
      params.push(`%${search}%`);
    }

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT d.id, d.domain_name, d.blocked_at as created_at, n.notice_code,
                COALESCE((SELECT executed_at FROM domain_executions WHERE domain_id = d.id ORDER BY executed_at DESC LIMIT 1), d.blocked_at) as executed_at
         FROM domains d
         LEFT JOIN notices n ON d.notice_id = n.id
         WHERE ${where}
         ORDER BY d.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM domains d WHERE ${where}`, params)
    ]);

    res.json({
      domains: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    });
  } catch (error) {
    console.error('Erro na API de domínios global:', error);
    res.status(500).json({ error: 'Erro ao buscar domínios globais' });
  }
});

router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.redirect('/login');
});

router.get('/dashboard', ensurePermission('dashboard'), async (req, res) => {
  const toast = consumeFlash(req);

  try {
    const [{ rows: totalsRows }, { rows: noticesCountRows }] = await Promise.all([
      pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE is_active = true) AS total_count,
            COUNT(*) FILTER (WHERE is_active = true AND notice_id IS NOT NULL) AS with_notice_count,
            COUNT(*) FILTER (WHERE is_active = true AND notice_id IS NULL) AS without_notice_count
         FROM domains`
      ),
      pool.query('SELECT COUNT(*) AS total_notices FROM notices')
    ]);

    const totals = {
      ...totalsRows[0],
      total_notices: parseInt(noticesCountRows[0].total_notices)
    };

    return res.render('dashboard', {
      title: 'Dashboard - DNSBlock',
      user: req.session.user,
      totals,
      toast,
      message: null,
      error: null
    });
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    return res.status(500).render('dashboard', {
      title: 'Dashboard - DNSBlock',
      user: req.session.user,
      totals: { total_count: 0, with_notice_count: 0, without_notice_count: 0, total_notices: 0 },
      toast,
      message: null,
      error: 'Erro ao carregar os dados do dashboard.'
    });
  }
});

router.get('/dns/integration', ensurePermission('integration'), async (req, res) => {
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

router.get('/reports/nslookup', ensurePermission('reports'), async (req, res) => {
  const toast = consumeFlash(req);
  let reportJob = null;
  const currentSessionJobId = req.session.nslookupReportJobId || null;

  try {
    const [versionResult, latestGeneralReportResult] = await Promise.all([
      pool.query(
        `SELECT version
         FROM blocklist_versions
         ORDER BY id DESC
         LIMIT 1`
      ),
      pool.query(
        `SELECT job_id, blocklist_version, status, progress, total, processed, report_file_name, error, updated_at, report_scope, notice_id
         FROM blocklist_reports
         WHERE report_scope = 'general'
         ORDER BY id DESC
         LIMIT 1`
      ),
    ]);

    let latestBlocklistVersion = versionResult.rows.length > 0 ? versionResult.rows[0].version : null;
    let latestGeneralReport = latestGeneralReportResult.rows.length > 0 ? latestGeneralReportResult.rows[0] : null;

    if (currentSessionJobId) {
      const currentJob = getJob(currentSessionJobId);
      if (currentJob) {
        reportJob = getPublicJobData(currentJob);
      } else {
        const persistedJobResult = await pool.query(
          `SELECT br.job_id,
                  br.status,
                  br.progress,
                  br.total,
                  br.processed,
                  br.error,
                  br.report_file_name,
                  br.report_scope,
                  br.notice_id,
                  COALESCE(NULLIF(TRIM(n.notice_code), ''), CONCAT('Oficio #', n.id::text)) AS notice_code
           FROM blocklist_reports br
           LEFT JOIN notices n ON n.id = br.notice_id
           WHERE br.job_id = $1
           LIMIT 1`,
          [currentSessionJobId]
        );

        if (persistedJobResult.rows.length > 0) {
          const row = persistedJobResult.rows[0];
          reportJob = {
            id: row.job_id,
            status: row.status,
            progress: Number(row.progress || 0),
            total: Number(row.total || 0),
            processed: Number(row.processed || 0),
            error: row.error || null,
            reportFileName: row.report_file_name || null,
            reportScope: row.report_scope || 'general',
            noticeId: row.notice_id || null,
            noticeCode: row.notice_code || null,
            scopeLabel: row.report_scope === 'notice'
              ? `Oficio ${row.notice_code || row.notice_id || ''}`.trim()
              : 'Geral',
          };
        } else {
          delete req.session.nslookupReportJobId;
        }
      }
    }

    const noticeReportsResult = await pool.query(
      `SELECT
          n.id,
          COALESCE(NULLIF(TRIM(n.notice_code), ''), CONCAT('Oficio #', n.id::text)) AS notice_code,
          COUNT(d.id)::INTEGER AS active_domains,
          last_report.job_id AS latest_job_id,
          last_report.status AS latest_status,
          last_report.progress AS latest_progress,
          last_report.report_file_name AS latest_report_file_name
       FROM notices n
       JOIN domains d
         ON d.notice_id = n.id
        AND d.is_active = true
       LEFT JOIN LATERAL (
         SELECT job_id, status, progress, report_file_name
         FROM blocklist_reports
         WHERE report_scope = 'notice'
           AND notice_id = n.id
           AND ($1::VARCHAR IS NULL OR blocklist_version = $1)
         ORDER BY id DESC
         LIMIT 1
       ) last_report ON true
       GROUP BY n.id, notice_code, last_report.job_id, last_report.status, last_report.progress, last_report.report_file_name
       ORDER BY n.id DESC`,
      [latestBlocklistVersion]
    );

    // If there is no active in-memory job, expose the latest completed report of the current version.
    if (!reportJob && latestGeneralReport && latestBlocklistVersion && latestGeneralReport.blocklist_version === latestBlocklistVersion) {
      reportJob = {
        id: latestGeneralReport.job_id,
        status: latestGeneralReport.status,
        progress: Number(latestGeneralReport.progress || 0),
        total: Number(latestGeneralReport.total || 0),
        processed: Number(latestGeneralReport.processed || 0),
        error: latestGeneralReport.error || null,
        reportFileName: latestGeneralReport.report_file_name || null,
        reportScope: 'general',
        noticeId: null,
        noticeCode: null,
        scopeLabel: 'Geral',
      };
    }

    return res.render('reports-nslookup', {
      title: 'Relatórios - DNSBlock',
      user: req.session.user,
      reportJob,
      latestBlocklistVersion,
      latestGeneralReport,
      noticeReports: noticeReportsResult.rows,
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
      latestGeneralReport: null,
      noticeReports: [],
      message: null,
      error: 'Erro interno ao carregar a página de relatórios.',
      toast,
    });
  }
});

router.get('/domains/new', ensureAuthenticated, async (req, res) => {
  const toast = consumeFlash(req);
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 5;
  const search = (req.query.search || '').trim();
  try {
    const invalidDomainsReview = await getInvalidDomainsReview(req.session.user.id, { page, pageSize, search });
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
  } catch (error) {
    console.error('Erro ao carregar domínios inválidos para revisão:', error);
    return renderDomainsForm(res, {
      user: req.session.user,
      message: null,
      error: null,
      inputDomains: '',
      inputNoticeCode: '',
      inputBlockStartDate: '',
      inputBlockEndDate: '',
      invalidDomainsReview: { rows: [], total: 0, page, pageSize, search, totalPages: 1 },
      toast,
    });
  }
});

router.post(
  '/notices',
  ensurePermission('notices.create'),
  upload.array('noticeFile'),
  async (req, res) => {
    const noticeCode = (req.body.noticeCode || '').trim();
    const noticeName = (req.body.noticeName || '').trim();
    const blockStartDate = req.body.blockStartDate ? req.body.blockStartDate : null;
    const blockEndDate = req.body.blockEndDate ? req.body.blockEndDate : null;
    const files = req.files;

    if (!noticeCode || !noticeName) {
      return res.status(400).render('domains-new', {
        title: 'Cadastrar Ofício - DNSBlock',
        user: req.session.user,
        message: null,
        error: 'Preencha o número e o nome do ofício.',
        inputNoticeCode: noticeCode,
        toast: null,
      });
    }

    try {
      const noticeResult = await pool.query(
        `INSERT INTO notices (notice_code, original_file_name, uploaded_by, block_start_date, block_end_date) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [noticeCode, noticeName, req.session.user.id, blockStartDate, blockEndDate]
      );
      
      const newNoticeId = noticeResult.rows[0].id;

      if (files && files.length > 0) {
        for (const file of files) {
          await pool.query(
            `INSERT INTO notice_files (notice_id, original_file_name, stored_file_name, mime_type, file_size, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [newNoticeId, file.originalname, file.filename, file.mimetype, file.size, req.session.user.id]
          );
        }
      }

      await logAudit(pool, {
        req,
        action: 'notices.create',
        details: {
          noticeId: newNoticeId,
          noticeCode,
          noticeName,
          fileCount: files ? files.length : 0
        },
      });

      setFlash(req, 'success', 'Ofício cadastrado com sucesso!');
      return res.redirect('/notices');
    } catch (error) {
      console.error('Erro ao cadastrar ofício:', error);
      return res.status(500).render('domains-new', {
        title: 'Cadastrar Ofício - DNSBlock',
        user: req.session.user,
        message: null,
        error: 'Erro interno ao cadastrar ofício.',
        inputNoticeCode: noticeCode,
        toast: null,
      });
    }
  }
);

router.post(
  '/notices/add-files',
  ensurePermission('notices.add_files'),
  upload.array('noticeFile'),
  async (req, res) => {
    const noticeId = Number(req.body.noticeId);
    const files = req.files;

    if (!noticeId || !Number.isInteger(noticeId)) {
      setFlash(req, 'error', 'Ofício inválido.');
      return res.redirect('/notices');
    }

    if (!files || files.length === 0) {
      setFlash(req, 'error', 'Nenhum arquivo enviado.');
      return res.redirect('/notices');
    }

    try {
      // Verifica se o ofício já foi informado
      const noticeCheck = await pool.query("SELECT status FROM notices WHERE id = $1", [noticeId]);
      if (noticeCheck.rows.length > 0 && noticeCheck.rows[0].status === 'informed') {
        setFlash(req, 'error', 'Não é permitido anexar arquivos a um ofício já respondido.');
        return res.redirect('/notices');
      }

      for (const file of files) {
        await pool.query(
          `INSERT INTO notice_files (notice_id, original_file_name, stored_file_name, mime_type, file_size, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [noticeId, file.originalname, file.filename, file.mimetype, file.size, req.session.user.id]
        );
      }

      await logAudit(pool, {
        req,
        action: 'notices.add_files',
        details: {
          noticeId,
          fileCount: files.length
        },
      });

      setFlash(req, 'success', 'Arquivo(s) anexado(s) com sucesso!');
      return res.redirect('/notices');
    } catch (error) {
      console.error('Erro ao anexar arquivos ao ofício:', error);
      setFlash(req, 'error', 'Erro interno ao anexar arquivos.');
      return res.redirect('/notices');
    }
  }
);

  // Blocos de validação de datas removidos após refatoração para fluxo por ofício

  // Trecho removido: lógica antiga de cadastro de domínios não é mais usada
  // Trecho removido: lógica antiga de cadastro de domínios não é mais usada

  // Trecho removido: lógica antiga de cadastro/reativação de domínios não é mais usada

// Marca um ofício como informado/respondido
router.post('/notices/:id/inform', ensurePermission('notices.inform'), async (req, res) => {
  const noticeId = Number(req.params.id);
  const informedAt = req.body.informedAt;
  const userId = req.session.user.id;

  if (!noticeId || !informedAt) {
    return res.status(400).json({ error: 'Dados insuficientes para marcar como informado.' });
  }

  try {
    // Verifica se o ofício tem domínios antes de permitir marcar como informado
    const domainCheck = await pool.query("SELECT COUNT(*) as count FROM domains WHERE notice_id = $1", [noticeId]);
    if (parseInt(domainCheck.rows[0].count) === 0) {
      return res.status(400).json({ error: 'Não é permitido responder um ofício que não possui domínios cadastrados.' });
    }

    await pool.query(
      `UPDATE notices 
       SET status = 'informed', 
           informed_at = $1, 
           informed_by = $2 
       WHERE id = $3`,
      [informedAt, userId, noticeId]
    );

      await logAudit(pool, {
        req,
        action: 'notices.inform',
        details: {
          noticeId,
          informedAt
        },
      });

      return res.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar ofício como informado:', error);
    return res.status(500).json({ error: 'Erro interno ao atualizar status do ofício.' });
  }
});

router.get('/notices/:id/download/:fileId', ensureAuthenticated, async (req, res) => {
  const noticeId = Number(req.params.id);
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(noticeId) || noticeId <= 0 || !Number.isInteger(fileId) || fileId <= 0) {
    return res.status(400).send('Parâmetros inválidos.');
  }

  try {
    const result = await pool.query(
      `SELECT original_file_name, stored_file_name, mime_type
       FROM notice_files
       WHERE id = $1 AND notice_id = $2`,
      [fileId, noticeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Arquivo não encontrado.');
    }

    const fileData = result.rows[0];

    if (!fileData.stored_file_name) {
      return res.status(404).send('Este ofício não possui arquivo anexado.');
    }

    const filePath = path.join(uploadsDir, fileData.stored_file_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Arquivo não encontrado no servidor.');
    }

    if (fileData.mime_type) {
      res.setHeader('Content-Type', fileData.mime_type);
    }

    return res.download(filePath, fileData.original_file_name || fileData.stored_file_name);
  } catch (error) {
    console.error('Erro ao baixar arquivo do ofício:', error);
    return res.status(500).send('Erro interno ao baixar arquivo.');
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
    await logAudit(pool, {
      req,
      action: 'dns.token_generate',
      details: {
        tokenPrefix,
      },
    });
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
    await logAudit(pool, {
      req,
      action: 'dns.token_revoke',
      details: {
        revokedCount: result.rowCount,
      },
    });
    return redirectWithFlash(req, res, 'success', 'Token DNS revogado com sucesso.', '/dns/integration');
  } catch (error) {
    console.error('Erro ao revogar token DNS:', error);
    return redirectWithFlash(req, res, 'error', 'Erro ao revogar token DNS.', '/dns/integration');
  }
});

router.post('/reports/nslookup/start', ensureAuthenticated, async (req, res) => {
  try {
    const rawNoticeId = String(req.body.noticeId || '').trim();
    const requestedNoticeId = rawNoticeId ? Number(rawNoticeId) : null;
    const isNoticeReport = Number.isInteger(requestedNoticeId) && requestedNoticeId > 0;

    const currentVersion = await getOrCreateCurrentBlocklistVersion();

    let noticeInfo = null;
    if (isNoticeReport) {
      const noticeResult = await pool.query(
        `SELECT id,
                COALESCE(NULLIF(TRIM(notice_code), ''), CONCAT('Oficio #', id::text)) AS notice_code
         FROM notices
         WHERE id = $1
         LIMIT 1`,
        [requestedNoticeId]
      );

      if (noticeResult.rows.length === 0) {
        return redirectWithFlash(req, res, 'error', 'Oficio informado nao foi encontrado.', '/reports/nslookup');
      }

      noticeInfo = noticeResult.rows[0];
    }

    const reportScope = isNoticeReport ? 'notice' : 'general';
    const scopedNoticeId = isNoticeReport ? requestedNoticeId : null;
    const scopeLabel = isNoticeReport ? `Oficio ${noticeInfo.notice_code}` : 'Geral';

    const reportForCurrentVersion = await pool.query(
      `SELECT id, job_id, status, blocklist_version
       FROM blocklist_reports
       WHERE blocklist_version = $1
         AND report_scope = $2
         AND ($3::BIGINT IS NULL AND notice_id IS NULL OR notice_id = $3)
       ORDER BY id DESC
       LIMIT 1`,
      [currentVersion, reportScope, scopedNoticeId]
    );

    if (reportForCurrentVersion.rows.length > 0) {
      const existingReport = reportForCurrentVersion.rows[0];
      if (existingReport.status === 'completed') {
        req.session.nslookupReportJobId = existingReport.job_id;
        return redirectWithFlash(
          req,
          res,
          'info',
          `Ja existe relatorio concluido (${scopeLabel}) para a versao ${currentVersion}. Gere um novo apenas apos mudanca de versao.`,
          '/reports/nslookup'
        );
      }

      if (existingReport.status === 'queued' || existingReport.status === 'running') {
        req.session.nslookupReportJobId = existingReport.job_id;
        return redirectWithFlash(
          req,
          res,
          'info',
          `Ja existe relatorio em execucao (${scopeLabel}) para a versao ${currentVersion}.`,
          '/reports/nslookup'
        );
      }
    }

    const existingJobId = req.session.nslookupReportJobId;
    if (existingJobId) {
      const existingJob = getJob(existingJobId);
      if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'running')) {
        return redirectWithFlash(req, res, 'info', 'Ja existe um relatorio em execucao. Aguarde a conclusao.', '/reports/nslookup');
      }
    }

    let domainsResult;

    if (isNoticeReport) {
      domainsResult = await pool.query(
        `SELECT domain_name
         FROM domains
         WHERE is_active = true
           AND notice_id = $1
         ORDER BY domain_name ASC`,
        [scopedNoticeId]
      );
    } else {
      domainsResult = await pool.query(
        `SELECT domain_name
         FROM domains
         WHERE is_active = true
         ORDER BY domain_name ASC`
      );
    }

    const domains = domainsResult.rows.map((row) => row.domain_name);

    if (domains.length === 0) {
      const emptyScopeLabel = isNoticeReport ? `do ${scopeLabel}` : 'ativos';
      return redirectWithFlash(req, res, 'info', `Nao ha dominios ${emptyScopeLabel} para gerar o relatorio.`, '/reports/nslookup');
    }

    const job = createNslookupJob(domains, req.session.user.username, {
      reportScope,
      noticeId: scopedNoticeId,
      noticeCode: noticeInfo ? noticeInfo.notice_code : null,
      scopeLabel,
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
          report_scope,
          notice_id,
          status,
          progress,
          total,
          processed,
          requested_by
        )
       VALUES ($1, $2, $3, $4, 'queued', 0, $5, 0, $6)`,
      [job.id, currentVersion, reportScope, scopedNoticeId, job.total, req.session.user.id]
    );

    req.session.nslookupReportJobId = job.id;

    await logAudit(pool, {
      req,
      action: 'reports.nslookup_start',
      details: {
        jobId: job.id,
        reportScope,
        noticeId: scopedNoticeId,
        noticeCode: noticeInfo ? noticeInfo.notice_code : null,
        currentVersion,
        totalDomains: domains.length,
      },
    });

    return redirectWithFlash(
      req,
      res,
      'success',
      `Relatorio ${scopeLabel.toLowerCase()} iniciado em background. Acompanhe o progresso abaixo.`,
      '/reports/nslookup'
    );
  } catch (error) {
    console.error('Erro ao iniciar relatorio nslookup:', error);
    return redirectWithFlash(req, res, 'error', 'Erro ao iniciar relatorio de verificacao.', '/reports/nslookup');
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
        `SELECT br.job_id,
                br.status,
                br.progress,
                br.total,
                br.processed,
                br.error,
                br.report_file_name,
                br.report_scope,
                br.notice_id,
                COALESCE(NULLIF(TRIM(n.notice_code), ''), CONCAT('Oficio #', n.id::text)) AS notice_code
         FROM blocklist_reports br
         LEFT JOIN notices n ON n.id = br.notice_id
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
          reportScope: row.report_scope || 'general',
          noticeId: row.notice_id,
          noticeCode: row.notice_code,
          scopeLabel: row.report_scope === 'notice'
            ? `Oficio ${row.notice_code || row.notice_id || ''}`.trim()
            : 'Geral',
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
    const errMsg = 'Informe o nome do domínio para exclusão.';
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ error: errMsg });
    }
    setFlash(req, 'error', errMsg);
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
      const infoMsg = `Nenhum domínio ativo encontrado com o nome ${normalizedDomain}.`;
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({ success: true, message: infoMsg });
      }
      setFlash(req, 'info', infoMsg);
      return res.redirect('/dashboard');
    }

    await logAudit(pool, {
      req,
      action: 'domains.delete_by_domain',
      details: {
        domainName: normalizedDomain,
        affectedRows: result.rowCount,
      },
    });

    const successMsg = `Domínio ${normalizedDomain} excluído com sucesso.`;
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, message: successMsg });
    }

    setFlash(req, 'success', successMsg);
    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro ao excluir domínio por nome:', error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ error: 'Erro ao excluir domínio por nome.' });
    }
    setFlash(req, 'error', 'Erro ao excluir domínio por nome.');
    return res.redirect('/dashboard');
  }
});

router.post('/domains/delete/by-notice', ensureAuthenticated, async (req, res) => {
  const noticeCode = (req.body.noticeCode || '').trim();

  if (!noticeCode) {
    const errMsg = 'Informe o número do ofício para exclusão.';
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ error: errMsg });
    }
    setFlash(req, 'error', errMsg);
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
      const infoMsg = `Nenhum domínio ativo encontrado para o ofício ${noticeCode}.`;
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({ success: true, message: infoMsg });
      }
      setFlash(req, 'info', infoMsg);
      return res.redirect('/dashboard');
    }

    await logAudit(pool, {
      req,
      action: 'domains.delete_by_notice',
      details: {
        noticeCode,
        affectedRows: result.rowCount,
      },
    });

    const successMsg = `Exclusão concluída. ${result.rowCount} domínio(s) removido(s) do ofício ${noticeCode}.`;
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, message: successMsg });
    }

    setFlash(req, 'success', successMsg);
    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro ao excluir domínios por ofício:', error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ error: 'Erro ao excluir domínios por ofício.' });
    }
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
      const infoMsg = 'Nenhum domínio ativo para excluir.';
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({ success: true, message: infoMsg });
      }
      setFlash(req, 'info', infoMsg);
      return res.redirect('/dashboard');
    }

    await logAudit(pool, {
      req,
      action: 'domains.delete_all',
      details: {
        affectedRows: result.rowCount,
      },
    });

    const successMsg = `Exclusão concluída. ${result.rowCount} domínio(s) removido(s) da blocklist.`;
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, message: successMsg });
    }

    setFlash(req, 'success', successMsg);
    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro ao excluir todos os domínios:', error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ error: 'Erro ao excluir todos os domínios.' });
    }
    setFlash(req, 'error', 'Erro ao excluir todos os domínios.');
    return res.redirect('/dashboard');
  }
});

// Listagem de ofícios cadastrados com paginação, busca e download
router.get('/notices', ensurePermission('notices'), async (req, res) => {
  const search = (req.query.search || '').trim();
  let where = '1=1';
  let params = [];
  if (search) {
    where += ' AND (n.notice_code ILIKE $1)';
    params.push(`%${search}%`);
  }
  const [dataResult, statsResult] = await Promise.all([
    pool.query(
      `SELECT n.id, n.notice_code, n.original_file_name, n.created_at, n.uploaded_by, n.id as notice_id,
              n.status, n.informed_at, n.informed_by,
              (SELECT username FROM users WHERE id = n.uploaded_by) as username,
              (SELECT username FROM users WHERE id = n.informed_by) as informer_username,
              COALESCE((SELECT COUNT(*) FROM domains d WHERE d.notice_id = n.id), 0) as total_domains,
              COALESCE(
                (SELECT json_agg(json_build_object('id', nf.id, 'original_file_name', nf.original_file_name))
                 FROM notice_files nf WHERE nf.notice_id = n.id),
                '[]'::json
              ) as files
       FROM notices n
       WHERE ${where}
       ORDER BY n.created_at DESC`,
      params
    ),
    pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'blocked') as blocked,
        COUNT(*) FILTER (WHERE status = 'informed') as informed
       FROM notices`
    )
  ]);

  const stats = statsResult.rows[0];
  const flash = req.session.flash || null;
  if (req.session.flash) delete req.session.flash;
  
  return res.render('notices-list', {
    title: 'Ofícios cadastrados',
    user: req.session.user,
    notices: dataResult.rows,
    search,
    flash,
    totals: {
      total: Number(stats.total || 0),
      blocked: Number(stats.blocked || 0),
      informed: Number(stats.informed || 0)
    }
  });
});

// Verifica se domínios já existem no banco (usado pelo modal de adição rápida)
router.post('/domains/check-exists', ensureAuthenticated, async (req, res) => {
  try {
    const { domains } = req.body;
    if (!Array.isArray(domains) || domains.length === 0) {
      return res.json({ registered: [] });
    }
    
    // Filtra duplicatas e limita para evitar abusos
    const uniqueDomains = [...new Set(domains)].slice(0, 500);
    
    const result = await pool.query(
      'SELECT domain_name FROM domains WHERE domain_name = ANY($1)',
      [uniqueDomains]
    );
    
    const registered = result.rows.map(r => r.domain_name);
    return res.json({ registered });
  } catch (error) {
    console.error('Erro ao verificar domínios:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
