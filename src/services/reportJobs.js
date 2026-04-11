const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const PDFDocument = require('pdfkit');
const iconv = require('iconv-lite');

const reportsDir = path.join(__dirname, '..', 'reports');
fs.mkdirSync(reportsDir, { recursive: true });

const jobs = new Map();

function scoreDecodedText(text) {
  const replacementCharCount = (text.match(/\uFFFD/g) || []).length;
  const controlCharCount = (text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g) || []).length;
  const mojibakeCount = (text.match(/Ã|Æ|Ð|ÿ|�|‚|£|ƒ|â€™|â€œ|â€|�/g) || []).length;
  const usefulTokenCount = (
    text.match(/Servidor|Server|Address|Addresses|Nome|Name|Aliases|Non-authoritative|Nao\s+e\s+resposta\s+autoritativa|Nao\s+e\s+resposta|Nao|timeout|can't\s+find/gi) || []
  ).length;

  return replacementCharCount * 10 + controlCharCount * 6 + mojibakeCount * 4 - usefulTokenCount;
}

function normalizeNslookupText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function decodeBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return '';
  }

  const decodings = [];

  // Windows CMD generally emits nslookup text in OEM code page (cp850 on pt-BR setups).
  try {
    decodings.push(iconv.decode(buffer, 'cp850'));
  } catch (error) {
    // ignored
  }

  try {
    decodings.push(iconv.decode(buffer, 'win1252'));
  } catch (error) {
    // ignored
  }

  try {
    decodings.push(buffer.toString('utf8'));
  } catch (error) {
    // ignored
  }

  try {
    decodings.push(buffer.toString('latin1'));
  } catch (error) {
    // ignored
  }

  if (decodings.length === 0) {
    return '';
  }

  function qualityScore(text) {
    const normalized = normalizeNslookupText(text);
    const lines = normalized.split('\n').map((line) => line.trim());

    const usefulLines = lines.filter((line) => looksLikeUsefulNslookupLine(line)).length;
    const suspiciousLines = lines.filter((line) => /[ÃÆÐÿ�‚£ƒâ€™â€œâ€]/.test(line)).length;
    const basePenalty = scoreDecodedText(normalized);

    return usefulLines * 10 - suspiciousLines * 8 - basePenalty;
  }

  let bestText = decodings[0];
  let bestScore = qualityScore(bestText);

  for (let index = 1; index < decodings.length; index += 1) {
    const currentText = decodings[index];
    const currentScore = qualityScore(currentText);
    if (currentScore > bestScore) {
      bestText = currentText;
      bestScore = currentScore;
    }
  }

  return bestText;
}

function looksLikeUsefulNslookupLine(line) {
  const text = line.trim();
  if (!text) {
    return false;
  }

  // Keep only canonical nslookup lines and continuation address lines.
  if (
    /^(Servidor|Server):/i.test(text) ||
    /^Address(?:es)?:/i.test(text) ||
    /^(Nome|Name):/i.test(text) ||
    /^Aliases:/i.test(text) ||
    /^(Nao\s+e\s+resposta\s+autoritativa|Não\s+é\s+resposta\s+autoritativa|Non-authoritative answer):/i.test(text) ||
    /^\*\*/.test(text) ||
    /^DNS request timed out\./i.test(text) ||
    /^can't find /i.test(text) ||
    /can't\s+find\s+.+:\s*(NXDOMAIN|SERVFAIL|REFUSED|NOERROR|Non-existent domain)/i.test(text)
  ) {
    return true;
  }

  // Keep indented secondary address lines produced by nslookup (IPv4 / IPv6 only).
  const addressOnlyLine = /^(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3}|[0-9a-fA-F:]{2,})$/.test(text);
  if (addressOnlyLine) {
    return true;
  }

  return false;
}

function hasOnlyExpectedChars(text) {
  if (!text) {
    return false;
  }

  // Allow Portuguese accents, ASCII punctuation and whitespace typically found in nslookup output.
  // Include: letters, numbers, accented chars, spaces, dots, commas, colons, semicolons, 
  // equals, parens, underscores, hyphens, slashes, brackets, quotes, asterisks, plus, angle brackets.
  return /^[A-Za-zÀ-ÿ0-9 .,:;=()_\-\/\[\]"'*+<>?!@#]+$/.test(text);
}

function sanitizeNslookupOutput(text) {
  if (!text) {
    return '';
  }

  const normalized = normalizeNslookupText(text);

  const lines = normalized
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => looksLikeUsefulNslookupLine(line))
    .filter((line) => {
      const trimmed = line.trim();

      // Keep raw IP continuation lines even if they have no label.
      if (/^(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3}|[0-9a-fA-F:]{2,})$/.test(trimmed)) {
        return true;
      }

      return hasOnlyExpectedChars(trimmed);
    });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function runNslookup(domain) {
  return new Promise((resolve) => {
    execFile(
      'nslookup',
      [domain],
      {
        encoding: 'buffer',
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const stdOutText = sanitizeNslookupOutput(decodeBuffer(stdout));
        const stdErrText = sanitizeNslookupOutput(decodeBuffer(stderr));

        if (error) {
          const message = [
            `Falha ao executar nslookup para ${domain}`,
            `Erro: ${error.message}`,
            stdErrText ? `STDERR:\n${stdErrText}` : '',
            stdOutText ? `STDOUT:\n${stdOutText}` : '',
          ]
            .filter(Boolean)
            .join('\n\n');

          resolve(message);
          return;
        }

        const merged = [stdOutText, stdErrText].filter(Boolean).join('\n\n');
        resolve(merged || 'Sem saída do comando nslookup.');
      }
    );
  });
}

function createPdfReport(filePath, domainsResults, metadata) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36 });
    const stream = fs.createWriteStream(filePath);

    stream.on('finish', resolve);
    stream.on('error', reject);

    doc.pipe(stream);

    const reportTitle = metadata.reportTitle || 'DNSBlock - Relatorio de Verificacao (nslookup)';

    doc.font('Helvetica-Bold').fontSize(18).text(reportTitle);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).text(`Gerado em: ${formatDateTime(metadata.generatedAt)}`);
    doc.text(`Usuario: ${metadata.requestedBy || 'desconhecido'}`);
    if (metadata.scopeLabel) {
      doc.text(`Escopo: ${metadata.scopeLabel}`);
    }
    doc.text(`Total de dominios: ${domainsResults.length}`);
    doc.moveDown();

    if (domainsResults.length === 0) {
      doc.font('Helvetica').fontSize(12).text('Nao ha dominios ativos para verificar.');
      doc.end();
      return;
    }

    domainsResults.forEach((result, index) => {
      doc.font('Helvetica-Bold').fontSize(12).text(`Dominio: ${result.domain}`);
      doc.moveDown(0.2);
      doc.font('Courier').fontSize(9).text(result.output || 'Sem retorno do nslookup.', {
        width: 520,
      });

      if (index < domainsResults.length - 1) {
        doc.moveDown(0.4);
        doc.font('Helvetica').fontSize(8).fillColor('#666666').text('------------------------------');
        doc.fillColor('#000000');
        doc.moveDown(0.4);
      }
    });

    doc.end();
  });
}

async function runNslookupJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  job.status = 'running';
  job.startedAt = new Date();
  if (typeof job.onStart === 'function') {
    job.onStart(job);
  }

  try {
    const results = [];

    for (let index = 0; index < job.domains.length; index += 1) {
      const domain = job.domains[index];
      const output = await runNslookup(domain);

      results.push({ domain, output });
      job.processed = index + 1;
      job.progress = Math.round((job.processed / Math.max(job.total, 1)) * 100);
      if (typeof job.onProgress === 'function') {
        job.onProgress(job);
      }
    }

    const safeDate = formatDateTime(new Date()).replace(/[: ]/g, '-');
    const reportFileName = `dns-report-${safeDate}-${jobId}.pdf`;
    const reportPath = path.join(reportsDir, reportFileName);

    await createPdfReport(reportPath, results, {
      generatedAt: new Date(),
      requestedBy: job.requestedBy,
      reportTitle: `DNSBlock - Relatorio ${job.reportScope === 'notice' ? 'por Oficio' : 'Geral'} (nslookup)`,
      scopeLabel: job.scopeLabel,
    });

    job.reportFileName = reportFileName;
    job.reportPath = reportPath;
    job.status = 'completed';
    job.progress = 100;
    job.finishedAt = new Date();
    if (typeof job.onComplete === 'function') {
      job.onComplete(job);
    }
  } catch (error) {
    job.status = 'failed';
    job.error = error.message || 'Falha ao gerar relatorio.';
    job.finishedAt = new Date();
    if (typeof job.onError === 'function') {
      job.onError(job);
    }
  }
}

function createNslookupJob(domains, requestedBy, options = {}) {
  const hooks = {
    onStart: options.onStart,
    onProgress: options.onProgress,
    onComplete: options.onComplete,
    onError: options.onError,
  };

  const reportScope = options.reportScope === 'notice' ? 'notice' : 'general';
  const noticeId = Number.isInteger(options.noticeId) ? options.noticeId : null;
  const noticeCode = options.noticeCode ? String(options.noticeCode) : null;
  const scopeLabel = options.scopeLabel || (reportScope === 'notice' ? `Oficio ${noticeCode || ''}`.trim() : 'Geral');

  const jobId = crypto.randomUUID();
  const uniqueDomains = [...new Set(domains)];

  const job = {
    id: jobId,
    status: 'queued',
    total: uniqueDomains.length,
    processed: 0,
    progress: 0,
    requestedBy: requestedBy || null,
    createdAt: new Date(),
    startedAt: null,
    finishedAt: null,
    reportFileName: null,
    reportPath: null,
    error: null,
    reportScope,
    noticeId,
    noticeCode,
    scopeLabel,
    domains: uniqueDomains,
    onStart: hooks.onStart,
    onProgress: hooks.onProgress,
    onComplete: hooks.onComplete,
    onError: hooks.onError,
  };

  jobs.set(jobId, job);

  setImmediate(() => {
    runNslookupJob(jobId);
  });

  return job;
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function getPublicJobData(job) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    progress: job.progress,
    error: job.error,
    reportFileName: job.reportFileName,
    reportScope: job.reportScope,
    noticeId: job.noticeId,
    noticeCode: job.noticeCode,
    scopeLabel: job.scopeLabel,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

module.exports = {
  createNslookupJob,
  getJob,
  getPublicJobData,
};
