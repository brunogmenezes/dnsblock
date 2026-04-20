const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { ensureAdmin, ensureAuthenticated, redirectIfAuthenticated } = require('../middlewares/auth');
const { logAudit } = require('../services/auditLogger');

const router = express.Router();

function setFlash(req, type, text) {
  req.session.flash = { type, text };
}

function consumeFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

function renderLogin(res, error) {
  return res.render('login', {
    title: 'Login - DNSBlock',
    error,
  });
}

function redirectWithFlash(req, res, type, text, targetPath) {
  setFlash(req, type, text);

  req.session.save(() => {
    res.redirect(targetPath);
  });
}

function sanitizePageSize(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 20;
  }

  return Math.min(parsed, 100);
}

function sanitizePage(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

async function getUsersPageData() {
  const result = await pool.query(
    `SELECT id, username, full_name, is_active, is_admin, must_change_password, created_at, password_changed_at
     FROM users
     ORDER BY is_admin DESC, username ASC`
  );

  return result.rows;
}

async function getUserById(userId) {
  const result = await pool.query(
    `SELECT id, username, full_name, is_active, is_admin, must_change_password, created_at, password_changed_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

async function getActiveAdminCount(excludeUserId) {
  if (excludeUserId) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM users
       WHERE is_admin = true
         AND is_active = true
         AND id <> $1`,
      [excludeUserId]
    );

    return Number(result.rows[0].total || 0);
  }

  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM users
     WHERE is_admin = true
       AND is_active = true`
  );

  return Number(result.rows[0].total || 0);
}

router.get('/login', redirectIfAuthenticated, (req, res) => {
  return renderLogin(res, null);
});

router.post('/login', redirectIfAuthenticated, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    await logAudit(pool, {
      req,
      action: 'auth.login_failed',
      details: {
        username: username || null,
        reason: 'missing_credentials',
      },
    });
    return renderLogin(res.status(400), 'Informe usuário e senha.');
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, full_name, must_change_password, is_admin FROM users WHERE username = $1 AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      await logAudit(pool, {
        req,
        action: 'auth.login_failed',
        details: {
          username,
          reason: 'user_not_found_or_inactive',
        },
      });
      return renderLogin(res.status(401), 'Usuário ou senha inválidos.');
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      await logAudit(pool, {
        req,
        action: 'auth.login_failed',
        userId: user.id,
        usernameSnapshot: user.username,
        details: {
          username,
          reason: 'invalid_password',
        },
      });
      return renderLogin(res.status(401), 'Usuário ou senha inválidos.');
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      mustChangePassword: Boolean(user.must_change_password),
      isAdmin: Boolean(user.is_admin),
    };

    await logAudit(pool, {
      req,
      action: 'auth.login_success',
      userId: user.id,
      usernameSnapshot: user.username,
      details: {
        mustChangePassword: Boolean(user.must_change_password),
        isAdmin: Boolean(user.is_admin),
      },
    });

    return res.redirect(user.must_change_password ? '/account/password' : '/dashboard');
  } catch (error) {
    console.error('Erro no login:', error);
    return renderLogin(res.status(500), 'Erro interno ao autenticar usuário.');
  }
});

router.get('/users', ensureAdmin, async (req, res) => {
  const toast = consumeFlash(req);

  try {
    const users = await getUsersPageData();

    return res.render('users-management', {
      title: 'Usuários - DNSBlock',
      user: req.session.user,
      users,
      toast,
      error: null,
      formData: {
        username: '',
        fullName: '',
        mustChangePassword: true,
        isAdmin: false,
      },
    });
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
    return res.status(500).render('users-management', {
      title: 'Usuários - DNSBlock',
      user: req.session.user,
      users: [],
      toast,
      error: 'Erro interno ao carregar os usuários.',
      formData: {
        username: '',
        fullName: '',
        mustChangePassword: true,
        isAdmin: false,
      },
    });
  }
});

router.post('/users', ensureAdmin, async (req, res) => {
  const username = String(req.body.username || '').trim();
  const fullName = String(req.body.fullName || '').trim();
  const password = String(req.body.password || '');
  const mustChangePassword = req.body.mustChangePassword === 'on';
  const isAdmin = req.body.isAdmin === 'on';

  if (!username || !fullName || !password) {
    const users = await getUsersPageData();
    return res.status(400).render('users-management', {
      title: 'Usuários - DNSBlock',
      user: req.session.user,
      users,
      toast: null,
      error: 'Preencha nome completo, usuário e senha inicial.',
      formData: { username, fullName, mustChangePassword, isAdmin },
    });
  }

  if (password.length < 6) {
    const users = await getUsersPageData();
    return res.status(400).render('users-management', {
      title: 'Usuários - DNSBlock',
      user: req.session.user,
      users,
      toast: null,
      error: 'A senha inicial deve ter pelo menos 6 caracteres.',
      formData: { username, fullName, mustChangePassword, isAdmin },
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, must_change_password, password_changed_at, is_admin)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [username, passwordHash, fullName, mustChangePassword, mustChangePassword ? null : new Date(), isAdmin]
    );

    await logAudit(pool, {
      req,
      action: 'users.create',
      details: {
        createdUsername: username,
        createdFullName: fullName,
        isAdmin,
        mustChangePassword,
      },
    });

    return redirectWithFlash(req, res, 'success', 'Usuário criado com sucesso.', '/users');
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    const users = await getUsersPageData();
    const duplicateError = error && error.code === '23505';

    return res.status(duplicateError ? 409 : 500).render('users-management', {
      title: 'Usuários - DNSBlock',
      user: req.session.user,
      users,
      toast: null,
      error: duplicateError ? 'Já existe um usuário com esse login.' : 'Erro interno ao criar usuário.',
      formData: { username, fullName, mustChangePassword, isAdmin },
    });
  }
});

router.get('/users/:id/edit', ensureAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const toast = consumeFlash(req);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).send('Usuário inválido.');
  }

  try {
    const targetUser = await getUserById(userId);

    if (!targetUser) {
      return res.status(404).send('Usuário não encontrado.');
    }

    return res.render('users-edit', {
      title: 'Editar Usuário - DNSBlock',
      user: req.session.user,
      targetUser,
      toast,
      error: null,
      formData: {
        fullName: targetUser.full_name,
        username: targetUser.username,
        isAdmin: Boolean(targetUser.is_admin),
        isActive: Boolean(targetUser.is_active),
        mustChangePassword: Boolean(targetUser.must_change_password),
      },
    });
  } catch (error) {
    console.error('Erro ao carregar edição de usuário:', error);
    return res.status(500).send('Erro interno ao carregar usuário.');
  }
});

router.post('/users/:id/edit', ensureAdmin, async (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).send('Usuário inválido.');
  }

  const fullName = String(req.body.fullName || '').trim();
  const username = String(req.body.username || '').trim();
  const isAdmin = req.body.isAdmin === 'on';
  const isActive = req.body.isActive === 'on';
  const mustChangePassword = req.body.mustChangePassword === 'on';
  const newPassword = String(req.body.newPassword || '');

  if (!fullName || !username) {
    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return res.status(404).send('Usuário não encontrado.');
    }

    return res.status(400).render('users-edit', {
      title: 'Editar Usuário - DNSBlock',
      user: req.session.user,
      targetUser,
      toast: null,
      error: 'Preencha nome completo e usuário.',
      formData: { fullName, username, isAdmin, isActive, mustChangePassword },
    });
  }

  if (newPassword && newPassword.length < 6) {
    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return res.status(404).send('Usuário não encontrado.');
    }

    return res.status(400).render('users-edit', {
      title: 'Editar Usuário - DNSBlock',
      user: req.session.user,
      targetUser,
      toast: null,
      error: 'Nova senha deve ter pelo menos 6 caracteres.',
      formData: { fullName, username, isAdmin, isActive, mustChangePassword },
    });
  }

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return res.status(404).send('Usuário não encontrado.');
    }

    if (targetUser.is_admin && (!isAdmin || !isActive)) {
      const remainingAdmins = await getActiveAdminCount(userId);
      if (remainingAdmins <= 0) {
        return res.status(400).render('users-edit', {
          title: 'Editar Usuário - DNSBlock',
          user: req.session.user,
          targetUser,
          toast: null,
          error: 'Não é permitido remover/inativar o último administrador ativo.',
          formData: { fullName, username, isAdmin, isActive, mustChangePassword },
        });
      }
    }

    let passwordHash = null;
    if (newPassword) {
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await pool.query(
      `UPDATE users
       SET full_name = $1,
           username = $2,
           is_admin = $3,
           is_active = $4,
           must_change_password = $5,
           password_hash = COALESCE($6, password_hash),
           password_changed_at = CASE
             WHEN $6 IS NOT NULL AND $5 = false THEN now()
             WHEN $6 IS NOT NULL AND $5 = true THEN NULL
             ELSE password_changed_at
           END
       WHERE id = $7`,
      [fullName, username, isAdmin, isActive, mustChangePassword, passwordHash, userId]
    );

    await logAudit(pool, {
      req,
      action: 'users.update',
      details: {
        targetUserId: userId,
        username,
        fullName,
        isAdmin,
        isActive,
        mustChangePassword,
        passwordChanged: Boolean(newPassword),
      },
    });

    if (req.session.user.id === userId) {
      req.session.user.username = username;
      req.session.user.fullName = fullName;
      req.session.user.isAdmin = isAdmin;
      req.session.user.mustChangePassword = mustChangePassword;
    }

    return redirectWithFlash(req, res, 'success', 'Usuário atualizado com sucesso.', '/users');
  } catch (error) {
    console.error('Erro ao editar usuário:', error);
    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return res.status(404).send('Usuário não encontrado.');
    }

    const duplicateError = error && error.code === '23505';
    return res.status(duplicateError ? 409 : 500).render('users-edit', {
      title: 'Editar Usuário - DNSBlock',
      user: req.session.user,
      targetUser,
      toast: null,
      error: duplicateError ? 'Já existe outro usuário com esse login.' : 'Erro interno ao atualizar usuário.',
      formData: { fullName, username, isAdmin, isActive, mustChangePassword },
    });
  }
});

router.post('/users/:id/delete', ensureAdmin, async (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).send('Usuário inválido.');
  }

  if (req.session.user.id === userId) {
    return redirectWithFlash(req, res, 'error', 'Você não pode excluir seu próprio usuário.', '/users');
  }

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return redirectWithFlash(req, res, 'error', 'Usuário não encontrado.', '/users');
    }

    if (targetUser.is_admin && targetUser.is_active) {
      const remainingAdmins = await getActiveAdminCount(userId);
      if (remainingAdmins <= 0) {
        return redirectWithFlash(req, res, 'error', 'Não é permitido excluir o último administrador ativo.', '/users');
      }
    }

    await pool.query(
      `UPDATE users
       SET is_active = false,
           must_change_password = false
       WHERE id = $1`,
      [userId]
    );

    await logAudit(pool, {
      req,
      action: 'users.deactivate',
      details: {
        targetUserId: userId,
        targetUsername: targetUser.username,
      },
    });

    return redirectWithFlash(req, res, 'success', 'Usuário excluído com sucesso.', '/users');
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    return redirectWithFlash(req, res, 'error', 'Erro interno ao excluir usuário.', '/users');
  }
});

router.get('/account/password', ensureAuthenticated, (req, res) => {
  const toast = consumeFlash(req);

  return res.render('account-password', {
    title: 'Alterar Senha - DNSBlock',
    user: req.session.user,
    toast,
    error: null,
    forceChange: Boolean(req.session.user.mustChangePassword),
  });
});

router.post('/account/password', ensureAuthenticated, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  const confirmPassword = String(req.body.confirmPassword || '');
  const forceChange = Boolean(req.session.user.mustChangePassword);

  if (!currentPassword || !newPassword || !confirmPassword) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ error: 'Preencha todos os campos da senha.' });
    }
    return res.status(400).render('account-password', {
      title: 'Alterar Senha - DNSBlock',
      user: req.session.user,
      toast: null,
      error: 'Preencha todos os campos da senha.',
      forceChange,
    });
  }

  if (newPassword.length < 6) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }
    return res.status(400).render('account-password', {
      title: 'Alterar Senha - DNSBlock',
      user: req.session.user,
      toast: null,
      error: 'A nova senha deve ter pelo menos 6 caracteres.',
      forceChange,
    });
  }

  if (newPassword !== confirmPassword) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ error: 'A confirmação da nova senha não confere.' });
    }
    return res.status(400).render('account-password', {
      title: 'Alterar Senha - DNSBlock',
      user: req.session.user,
      toast: null,
      error: 'A confirmação da nova senha não confere.',
      forceChange,
    });
  }

  try {
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1 AND is_active = true',
      [req.session.user.id]
    );

    if (result.rows.length === 0) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }
      return res.status(404).render('account-password', {
        title: 'Alterar Senha - DNSBlock',
        user: req.session.user,
        toast: null,
        error: 'Usuário não encontrado.',
        forceChange,
      });
    }

    const currentMatches = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

    if (!currentMatches) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(400).json({ error: 'A senha atual informada está incorreta.' });
      }
      return res.status(400).render('account-password', {
        title: 'Alterar Senha - DNSBlock',
        user: req.session.user,
        toast: null,
        error: 'A senha atual informada está incorreta.',
        forceChange,
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = false,
           password_changed_at = now()
       WHERE id = $2`,
      [newPasswordHash, req.session.user.id]
    );

    await logAudit(pool, {
      req,
      action: 'users.change_password',
      details: {
        forceChange,
      },
    });

    req.session.user.mustChangePassword = false;

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ 
        success: true, 
        message: forceChange ? 'Senha alterada com sucesso. Agora você pode usar o sistema normalmente.' : 'Sua senha foi alterada com sucesso.',
        redirect: forceChange ? '/dashboard' : null
      });
    }

    return redirectWithFlash(
      req,
      res,
      'success',
      forceChange ? 'Senha alterada com sucesso. Agora você pode usar o sistema normalmente.' : 'Sua senha foi alterada com sucesso.',
      forceChange ? '/dashboard' : '/account/password'
    );
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ error: 'Erro interno ao alterar a senha.' });
    }
    return res.status(500).render('account-password', {
      title: 'Alterar Senha - DNSBlock',
      user: req.session.user,
      toast: null,
      error: 'Erro interno ao alterar a senha.',
      forceChange,
    });
  }
});

router.get('/audit', ensureAdmin, async (req, res) => {
  const toast = consumeFlash(req);
  const query = String(req.query.q || '').trim();
  const pageSize = sanitizePageSize(req.query.limit);
  const requestedPage = sanitizePage(req.query.page);

  const filters = [];
  const params = [];

  if (query) {
    params.push(`%${query}%`);
    filters.push(`(
      COALESCE(u.username, '') ILIKE $${params.length}
      OR COALESCE(u.full_name, '') ILIKE $${params.length}
      OR COALESCE(al.username_snapshot, '') ILIKE $${params.length}
      OR COALESCE(al.ip_address, '') ILIKE $${params.length}
      OR al.action ILIKE $${params.length}
      OR COALESCE(al.details::text, '') ILIKE $${params.length}
    )`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::INT AS total
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${whereClause}`,
      params
    );

    const total = Number(countResult.rows[0].total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(requestedPage, totalPages);
    const safeOffset = (currentPage - 1) * pageSize;

    const rowsResult = await pool.query(
      `SELECT
          al.id,
          al.action,
          al.ip_address,
          al.created_at,
          al.details,
          al.username_snapshot,
          u.id AS actor_user_id,
          u.username AS actor_username,
          u.full_name AS actor_full_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      [...params, pageSize, safeOffset]
    );

    return res.render('audit', {
      title: 'Auditoria - DNSBlock',
      user: req.session.user,
      toast,
      logs: rowsResult.rows,
      query,
      pageSize,
      currentPage,
      totalPages,
      total,
      error: null,
    });
  } catch (error) {
    console.error('Erro ao carregar auditoria:', error);
    return res.status(500).render('audit', {
      title: 'Auditoria - DNSBlock',
      user: req.session.user,
      toast,
      logs: [],
      query,
      pageSize,
      currentPage: 1,
      totalPages: 1,
      total: 0,
      error: 'Erro interno ao carregar auditoria.',
    });
  }
});

router.post('/logout', async (req, res) => {
  await logAudit(pool, {
    req,
    action: 'auth.logout',
  });

  req.session.destroy(() => {
    res.clearCookie('dnsblock.sid');
    return res.redirect('/login');
  });
});

module.exports = router;
