const crypto = require('node:crypto');

/**
 * Start a new session for a user.
 * @returns {Promise<{ expiresAt: Date }>} When the new token expires
 */
const createRefreshToken = async (db, { userId, tokenHash, idleSeconds, maxSeconds }) => {
  const { rows } = await db.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, session_expires_at)
     VALUES ($1, $2, $3,
             now() + make_interval(secs => LEAST($4::integer, $5::integer)),
             now() + make_interval(secs => $5::integer))
     RETURNING expires_at AS "expiresAt"`,
    [userId, crypto.randomUUID(), tokenHash, idleSeconds, maxSeconds],
  );
  return rows[0];
};

/**
 * Exchange a live refresh token for a new one and the same session. The token is revoked and its
 * replacement inserted in one statement; because the UPDATE only matches an unrevoked row, two
 * concurrent requests with the same token cannot both succeed.
 * @returns {Promise<{ user: object, expiresAt: Date } | null>} The session's user and the new
 *          token's expiry, or null if the token is unknown, expired, or already used
 */
const rotateRefreshToken = async (db, { tokenHash, nextTokenHash, idleSeconds }) => {
  const { rows } = await db.query(
    `WITH consumed AS (
       UPDATE refresh_tokens SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       RETURNING user_id, family_id, session_expires_at
     ), issued AS (
       INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, session_expires_at)
       SELECT user_id, family_id, $2,
              LEAST(now() + make_interval(secs => $3::integer), session_expires_at),
              session_expires_at
       FROM consumed
       RETURNING user_id, expires_at
     )
     SELECT u.id, u.username, u.created_at AS "createdAt", issued.expires_at AS "expiresAt"
     FROM issued JOIN users u ON u.id = issued.user_id`,
    [tokenHash, nextTokenHash, idleSeconds],
  );
  if (!rows[0]) {
    return null;
  }
  const { expiresAt, ...user } = rows[0];
  return { user, expiresAt };
};

/**
 * End the session a token belongs to by revoking every live token in its family. Used for
 * logout, and when an already-used token is presented again (it was copied, so the session can
 * no longer be trusted). Does nothing for an unknown token.
 * @returns {Promise<number>} How many live tokens were revoked
 */
const revokeFamily = async (db, tokenHash) => {
  const { rowCount } = await db.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE revoked_at IS NULL
       AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
    [tokenHash],
  );
  return rowCount;
};

// Removes all expired refresh tokens to avoid clutter
const deleteExpiredRefreshTokens = async (db, userId) => {
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at <= now()', [userId]);
};

module.exports = {
  createRefreshToken,
  rotateRefreshToken,
  revokeFamily,
  deleteExpiredRefreshTokens,
};
