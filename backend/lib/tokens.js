const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const REFRESH_TOKEN_IDLE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_MAX_SECONDS = 30 * 24 * 60 * 60;

const ALGORITHM = 'HS256';
const ISSUER = 'fall2026-coding-challenge';
const AUDIENCE = 'fall2026-coding-challenge-api';

const MIN_SECRET_BYTES = 32;

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < MIN_SECRET_BYTES) {
    throw new Error(
      `JWT_SECRET must be set to at least ${MIN_SECRET_BYTES} bytes. Generate one with: ` +
        `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
  return secret;
};

/**
 * Called at startup so a missing secret fails the boot instead of the first login
 */
const assertConfigured = () => {
  getSecret();
};

/**
 * Sign an access token for a user. The user id goes in the standard "sub" claim.
 * @param {{ id: number, username: string }} user
 * @returns {string} The encoded JWT
 */
const signAccessToken = user =>
  jwt.sign({ username: user.username }, getSecret(), {
    algorithm: ALGORITHM,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: String(user.id),
  });

/**
 * Verify an access token's signature, algorithm, issuer, audience and expiry.
 * @param {string} token
 * @returns {{ id: number, username: string } | null} The user it was issued to, or null if the
 *          token is invalid or expired
 */
const verifyAccessToken = token => {
  try {
    const claims = jwt.verify(token, getSecret(), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const id = Number(claims.sub);
    if (!Number.isInteger(id) || typeof claims.username !== 'string') {
      return null;
    }
    return { id, username: claims.username };
  } catch (err) {
    // Covers TokenExpiredError and NotBeforeError, which extend it
    if (err instanceof jwt.JsonWebTokenError) {
      return null;
    }
    throw err;
  }
};

const generateRefreshToken = () => crypto.randomBytes(32).toString('base64url');

const hashRefreshToken = token => crypto.createHash('sha256').update(token).digest('hex');

module.exports = {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_IDLE_SECONDS,
  SESSION_MAX_SECONDS,
  assertConfigured,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
};
