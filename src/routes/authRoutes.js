const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { ensureAdmin, ensureAuthenticated, redirectIfAuthenticated } = require('../middlewares/auth');

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
    return renderLogin(res.status(400), 'Informe usuário e senha.');
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, full_name, must_change_password, is_admin FROM users WHERE username = $1 AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      return renderLogin(res.status(401), 'Usuário ou senha inválidos.');
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return renderLogin(res.status(401), 'Usuário ou senha inválidos.');
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      mustChangePassword: Boolean(user.must_change_password),
      isAdmin: Boolean(user.is_admin),
    };

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
    return res.status(400).render('account-password', {
      title: 'Alterar Senha - DNSBlock',
      user: req.session.user,
      toast: null,
      error: 'Preencha todos os campos da senha.',
      forceChange,
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).render('account-password', {
      title: 'Alterar Senha - DNSBlock',
      user: req.session.user,
      toast: null,
      error: 'A nova senha deve ter pelo menos 6 caracteres.',
      forceChange,
    });
  }

  if (newPassword !== confirmPassword) {
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

    req.session.user.mustChangePassword = false;

    return redirectWithFlash(
      req,
      res,
      'success',
      forceChange ? 'Senha alterada com sucesso. Agora você pode usar o sistema normalmente.' : 'Sua senha foi alterada com sucesso.',
      '/account/password'
    );
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return res.status(500).render('account-password', {
      title: 'Alterar Senha - DNSBlock',
      user: req.session.user,
      toast: null,
      error: 'Erro interno ao alterar a senha.',
      forceChange,
    });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('dnsblock.sid');
    return res.redirect('/login');
  });
});

module.exports = router;
