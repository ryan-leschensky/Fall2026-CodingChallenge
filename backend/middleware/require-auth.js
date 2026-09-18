const HttpError = require('../lib/http-error');
const { verifyAccessToken } = require('../lib/tokens');

/**
 * Middleware that requires a valid access token in "Authorization: Bearer <token>" and sets
 * req.user to { id, username }. Responds 401 otherwise; the client should then call
 * POST /api/auth/refresh and retry.
 */
const requireAuth = (req, res, next) => {
  const [scheme, token] = (req.get('Authorization') ?? '').split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    res.set('WWW-Authenticate', 'Bearer');
    throw new HttpError(401, 'Authentication required');
  }

  const user = verifyAccessToken(token);
  if (!user) {
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    throw new HttpError(401, 'Invalid or expired access token');
  }

  req.user = user;
  next();
};

module.exports = requireAuth;
