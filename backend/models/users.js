/**
 * Database access for user accounts. Every function takes the pg pool (req.pool) as its first
 *  argument, so routes and tests can pass whichever connection they have.
 */

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const UNIQUE_VIOLATION = '23505';

const PUBLIC_COLUMNS = 'id, username, created_at AS "createdAt"';

/**
 * Error thrown when a username is already taken.
 */
class UsernameTakenError extends Error {
  constructor(username) {
    super(`Username "${username}" is already taken`);
    this.name = 'UsernameTakenError';
  }
}

/**
 * List all users
 * @param db              Database connection
 * @returns {Promise<*>}  All users
 */
const listUsers = async db => {
  const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY id`);
  return rows;
};

/**
 * Finds a user by their numeric database ID.
 * @param db                    Database connection
 * @param {number} id           User ID (integer primary key)
 * @returns {Promise<*|null>}   Returns the user, or null if not found
 */
const findUserById = async (db, id) => {
  const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
};

/**
 * Finds a user by their unique username.
 * @param db                    Database connection
 * @param {string} username     Username
 * @returns {Promise<*|null>}   Returns the user, or null if not found
 */
const findUserByUsername = async (db, username) => {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE LOWER(username) = LOWER($1)`,
    [username],
  );
  return rows[0] ?? null;
};

/**
 * Finds a user's credentials by their unique username.
 * @param db                    Database connection
 * @param {string} username     Username
 * @returns {Promise<*|null>}   Returns the user, or null if not found
 */
const findCredentialsByUsername = async (db, username) => {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash AS "passwordHash"
     FROM users WHERE LOWER(username) = LOWER($1)`,
    [username],
  );
  return rows[0] ?? null;
};

/**
 * Registers a user given an object containing their username and password hash.
 * @param db                            Database connection
 * @param {object} param1               User data
 * @param {string} param1.username      Username
 * @param {string} param1.passwordHash  Password hash
 * @returns {Promise<*>}                Returns the newly created user if successful
 */
const createUser = async (db, { username, passwordHash }) => {
  try {
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING ${PUBLIC_COLUMNS}`,
      [username, passwordHash],
    );
    return rows[0];
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new UsernameTakenError(username);
    }
    throw err;
  }
};

module.exports = {
  USERNAME_PATTERN,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  UsernameTakenError,
  listUsers,
  findUserById,
  findUserByUsername,
  findCredentialsByUsername,
  createUser,
};
