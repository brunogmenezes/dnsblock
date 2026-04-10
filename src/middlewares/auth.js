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

module.exports = {
  ensureAuthenticated,
  ensureAdmin,
  redirectIfAuthenticated,
};
