const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { redirectIfAuthenticated } = require('../middlewares/auth');

const router = express.Router();

router.get('/login', redirectIfAuthenticated, (req, res) => {
  return res.render('login', {
    title: 'Login - DNSBlock',
    error: null,
  });
});

router.post('/login', redirectIfAuthenticated, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).render('login', {
      title: 'Login - DNSBlock',
      error: 'Informe usuário e senha.',
    });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, full_name FROM users WHERE username = $1 AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).render('login', {
        title: 'Login - DNSBlock',
        error: 'Usuário ou senha inválidos.',
      });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).render('login', {
        title: 'Login - DNSBlock',
        error: 'Usuário ou senha inválidos.',
      });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
    };

    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).render('login', {
      title: 'Login - DNSBlock',
      error: 'Erro interno ao autenticar usuário.',
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
