function ensureAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  return next();
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return next();
}

module.exports = {
  ensureAuthenticated,
  redirectIfAuthenticated,
};
