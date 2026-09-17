const { Pool } = require('pg');

// Create a PostgreSQL pool for database connections
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// An idle client can error (e.g. the server restarts); without a listener this crashes the process
pool.on('error', err => {
  console.error('Unexpected PostgreSQL client error:', err.message);
});

// Fail fast at startup if the database is not configured or not reachable
const connect = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  await pool.query('SELECT 1');
};

// Middleware to make the PostgreSQL pool accessible in request handlers
const PostgreSQL = (req, res, next) => {
  req.pool = pool;
  next();
};

module.exports = { pool, connect, PostgreSQL };
