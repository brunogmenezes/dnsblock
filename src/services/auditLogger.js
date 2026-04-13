function getClientIp(req) {
  const forwardedFor = req.get('x-forwarded-for');
  const candidate = forwardedFor
    ? String(forwardedFor).split(',')[0].trim()
    : (req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '');

  if (!candidate) {
    return null;
  }

  return candidate.replace(/^::ffff:/, '');
}

function normalizeDetails(details) {
  if (!details || typeof details !== 'object') {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(details));
  } catch (error) {
    return {
      detailSerializationError: true,
    };
  }
}

async function logAudit(pool, {
  req,
  action,
  userId = null,
  usernameSnapshot = null,
  details = null,
}) {
  if (!pool || !req || !action) {
    return;
  }

  const sessionUser = req.session && req.session.user ? req.session.user : null;
  const resolvedUserId = userId || (sessionUser ? sessionUser.id : null);
  const resolvedUsername = usernameSnapshot
    || (sessionUser ? (sessionUser.username || sessionUser.fullName || null) : null);

  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, username_snapshot, action, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        resolvedUserId,
        resolvedUsername,
        action,
        getClientIp(req),
        req.get('user-agent') || null,
        normalizeDetails(details),
      ]
    );
  } catch (error) {
    console.error('Erro ao registrar auditoria:', error);
  }
}

module.exports = {
  getClientIp,
  logAudit,
};
