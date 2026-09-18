require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { pool, connect } = require('../db/db');

/**
 * Seeds the database with initial user data from `users.sql` within a transaction.
 * @returns {Promise<void>} Resolves when the database has been seeded successfully.
 * @throws {Error} If reading the SQL file or executing the queries fails.
 */
const seed = async () => {
  await connect();
  const sql = await fs.readFile(path.join(__dirname, 'users.sql'), 'utf8');

  const client = await pool.connect() ;
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

seed()
  .then(() => console.log('Database seeded'))
  .catch(err => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
