const express = require('express');
const HttpError = require('../lib/http-error');
const { verifyPassword, getDummyHash } = require('../lib/password');
const Tokens = require('../lib/tokens');
const requireAuth = require('../middleware/require-auth');
const Users = require('../models/users');
const RefreshTokens = require('../models/refresh-tokens');

const router = express.Router();

// Anything longer cannot be a valid password, so skip hashing it
const MAX_PASSWORD_INPUT = 1024;

const REFRESH_COOKIE = 'refresh_token';

// httpOnly keeps the refresh token away from page scripts (and XSS). The path limits the cookie
// to this router, so it is sent to /refresh and /logout and nowhere else. SameSite=Strict stops
// other sites from making the browser send it.
const refreshCookieOptions = req => ({
  httpOnly: true,
  secure: req.app.get('env') === 'production',
  sameSite: 'strict',
  path: req.baseUrl,
});

/**
 * Sends the session to the client: the refresh token as a cookie, and the user plus a new access
 * token in the body.
 */
const sendSession = (req, res, user, refreshToken, refreshExpiresAt) => {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...refreshCookieOptions(req),
    expires: refreshExpiresAt,
  });
  res.set('Cache-Control', 'no-store');
  res.json({
    user,
    accessToken: Tokens.signAccessToken(user),
    tokenType: 'Bearer',
    expiresIn: Tokens.ACCESS_TOKEN_TTL_SECONDS,
  });
};

const clearRefreshCookie = (req, res) => {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(req));
};

/**
 * Endpoint to authenticate a user (login). Starts a session: responds with an access token and
 * sets the refresh token cookie.
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, 'username and password are required');
  }

  const invalid = new HttpError(401, 'Invalid username or password');
  if (password.length > MAX_PASSWORD_INPUT) {
    throw invalid;
  }

  // An unknown user is still checked against a dummy hash so both cases take the same time
  const credentials = await Users.findCredentialsByUsername(req.pool, username);
  const matches = await verifyPassword(
    password,
    credentials?.passwordHash ?? (await getDummyHash()),
  );
  if (!credentials || !matches) {
    throw invalid;
  }

  const { passwordHash, ...user } = credentials;

  await RefreshTokens.deleteExpiredRefreshTokens(req.pool, user.id);
  const refreshToken = Tokens.generateRefreshToken();
  const { expiresAt } = await RefreshTokens.createRefreshToken(req.pool, {
    userId: user.id,
    tokenHash: Tokens.hashRefreshToken(refreshToken),
    idleSeconds: Tokens.REFRESH_TOKEN_IDLE_SECONDS,
    maxSeconds: Tokens.SESSION_MAX_SECONDS,
  });

  sendSession(req, res, user, refreshToken, expiresAt);
});

/**
 * Endpoint to get a new access token using the refresh token cookie. The refresh token is
 * rotated: the cookie is replaced and the old token stops working.
 */
router.post('/refresh', async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (typeof presented !== 'string' || !presented) {
    throw new HttpError(401, 'No session');
  }

  const tokenHash = Tokens.hashRefreshToken(presented);
  const nextToken = Tokens.generateRefreshToken();
  const rotated = await RefreshTokens.rotateRefreshToken(req.pool, {
    tokenHash,
    nextTokenHash: Tokens.hashRefreshToken(nextToken),
    idleSeconds: Tokens.REFRESH_TOKEN_IDLE_SECONDS,
  });

  if (!rotated) {
    // The token is unknown, expired, or was already used. A used token coming back means a copy
    // of it exists somewhere, so end the whole session rather than trust either holder.
    const revoked = await RefreshTokens.revokeFamily(req.pool, tokenHash);
    if (revoked > 0) {
      console.warn('Refresh token reuse detected; session revoked');
    }
    clearRefreshCookie(req, res);
    throw new HttpError(401, 'Session expired');
  }

  sendSession(req, res, rotated.user, nextToken, rotated.expiresAt);
});

/**
 * Endpoint to end the current session (logout). Revokes the refresh token and clears its cookie.
 * Always succeeds, even without a session. The client should also discard its access token,
 * which stays valid until it expires.
 */
router.post('/logout', async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (typeof presented === 'string' && presented) {
    await RefreshTokens.revokeFamily(req.pool, Tokens.hashRefreshToken(presented));
  }
  clearRefreshCookie(req, res);
  res.status(204).end();
});

/**
 * Endpoint to get the currently logged-in user.
 */
router.get('/me', requireAuth, async (req, res) => {
  const user = await Users.findUserById(req.pool, req.user.id);
  if (!user) {
    // The account was deleted after the token was issued
    throw new HttpError(401, 'Authentication required');
  }
  res.json(user);
});

module.exports = router;
