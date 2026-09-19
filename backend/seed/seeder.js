require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { pool, connect } = require('../db/db');

// Run in this order: a table's file must come after the tables its foreign keys reference
const SQL_FILES = ['users.sql', 'refresh-tokens.sql', 'collections.sql', 'collection-images.sql'];

/**
 * Creates the database schema by running each file in `SQL_FILES` in order within one transaction.
 * @returns {Promise<void>} Resolves when the database has been seeded successfully.
 * @throws {Error} If reading a SQL file or executing its queries fails.
 */
const seed = async () => {
  await connect();
  const scripts = await Promise.all(
    SQL_FILES.map(file => fs.readFile(path.join(__dirname, file), 'utf8')),
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sql of scripts) {
      await client.query(sql);
    }
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
