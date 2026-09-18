const express = require('express');
const HttpError = require('../lib/http-error');
const { verifyPassword, getDummyHash } = require('../lib/password');
const Users = require('../models/users');

const router = express.Router();

// Anything longer cannot be a valid password, so skip hashing it
const MAX_PASSWORD_INPUT = 1024;

// Check a username and password. The same 401 is returned for an unknown user and a wrong
// password so the response does not reveal which usernames exist.
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
  res.json(user);
});

module.exports = router;
