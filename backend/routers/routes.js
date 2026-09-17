const express = require('express');

const router = express.Router();

const isNonEmptyString = value => typeof value === 'string' && value.trim() !== '';

// Fetch all users
router.get('/users', async (req, res) => {
  const { rows } = await req.pool.query('SELECT id, name, lastname FROM users ORDER BY id');
  res.json(rows);
});

// Create a user
router.post('/users', async (req, res) => {
  const { name, lastname } = req.body ?? {};

  if (!isNonEmptyString(name) || !isNonEmptyString(lastname)) {
    return res.status(400).json({ message: 'name and lastname are required' });
  }

  const { rows } = await req.pool.query(
    'INSERT INTO users (name, lastname) VALUES ($1, $2) RETURNING id, name, lastname',
    [name.trim(), lastname.trim()],
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
