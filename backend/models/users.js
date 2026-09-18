// Database access for user accounts. Every function takes the pg pool (req.pool) as its first
// argument so routes and tests can pass whichever connection they have.

// Letters, digits, '.', '_' and '-', 3 to 30 characters. Mirrors the users_username_format
// CHECK constraint in seed/users.sql.
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

// Postgres error code for a unique constraint violation
const UNIQUE_VIOLATION = '23505';

// Columns that are safe to send to clients (never the password hash)
const PUBLIC_COLUMNS = 'id, username, created_at AS "createdAt"';

class UsernameTakenError extends Error {
  constructor(username) {
    super(`Username "${username}" is already taken`);
    this.name = 'UsernameTakenError';
  }
}

const listUsers = async db => {
  const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY id`);
  return rows;
};

const findUserById = async (db, id) => {
  const { rows } = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
};

// Case-insensitive: 'ALICE' finds the user registered as 'Alice'
const findUserByUsername = async (db, username) => {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE LOWER(username) = LOWER($1)`,
    [username],
  );
  return rows[0] ?? null;
};

// Includes the password hash; only for checking credentials, never for responses
const findCredentialsByUsername = async (db, username) => {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash AS "passwordHash"
     FROM users WHERE LOWER(username) = LOWER($1)`,
    [username],
  );
  return rows[0] ?? null;
};

// Relies on the unique index rather than checking first, so two simultaneous sign-ups for
// 'Alice' and 'alice' cannot both succeed
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
