function ensureAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  if (req.session.user.mustChangePassword && req.path !== '/account/password') {
    return res.redirect('/account/password');
  }

  return next();
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session.user) {
    return res.redirect(req.session.user.mustChangePassword ? '/account/password' : '/dashboard');
  }

  return next();
}

function ensureAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  if (req.session.user.mustChangePassword && req.path !== '/account/password') {
    return res.redirect('/account/password');
  }

  if (!req.session.user.isAdmin) {
    return res.status(403).send('Acesso negado.');
  }

  return next();
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (!user.permissions) return false;
  if (user.permissions.all === true) return true;

  // 1. Verifica se tem a página explicitamente
  if (user.permissions.pages && user.permissions.pages.includes(permission)) {
    return true;
  }

  // 2. Verifica se tem a ação explicitamente
  if (user.permissions.actions && user.permissions.actions.includes(permission)) {
    return true;
  }

  // 3. Se pediu uma página (ex: 'notices'), mas o usuário tem apenas ações nela (ex: 'notices.create')
  //    Devemos permitir o acesso à página base.
  if (user.permissions.actions && user.permissions.actions.some(a => a.startsWith(permission + '.'))) {
    return true;
  }

  return false;
}

function ensurePermission(permission) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    if (hasPermission(req.session.user, permission)) {
      return next();
    }

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(403).json({ error: 'Você não tem permissão para realizar esta ação.' });
    }

    res.status(403).render('error', {
      title: 'Acesso Negado',
      message: 'Você não tem permissão para acessar esta página ou realizar esta ação.',
      user: req.session.user
    });
  };
}

module.exports = {
  ensureAuthenticated,
  ensureAdmin,
  ensurePermission,
  redirectIfAuthenticated,
  hasPermission
};
