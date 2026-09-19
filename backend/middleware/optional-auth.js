const requireAuth = require('./require-auth');

/**
 * Middleware for routes that work without logging in but show more to a logged-in user. With no
 * Authorization header, req.user is left unset. A header that is present is checked like
 * requireAuth does, so an expired token still gets a 401 and the client knows to refresh it.
 */
const optionalAuth = (req, res, next) => {
  if (!req.get('Authorization')) {
    return next();
  }
  requireAuth(req, res, next);
};

module.exports = optionalAuth;
