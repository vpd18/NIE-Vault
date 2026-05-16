function requireLogin(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'You must be logged in.' });
}

module.exports = { requireLogin };