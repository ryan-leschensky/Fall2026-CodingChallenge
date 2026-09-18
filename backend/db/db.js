const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Listens for errors on the PostgreSQL client pool and logs them
 */
pool.on('error', err => {
  console.error('Unexpected PostgreSQL client error:', err.message);
});

/**
 * Throws an error if the DATABASE_URL environment variable is not set
 * @returns {Promise<void>}     Returns nothing if successful
 */
const connect = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  await pool.query('SELECT 1');
};

/**
 * Middleware to make the PostgreSQL pool accessible in request handlers
 * @param req
 * @param res
 * @param next
 * @constructor
 */
const PostgreSQL = (req, res, next) => {
  req.pool = pool;
  next();
};

module.exports = { pool, connect, PostgreSQL };
