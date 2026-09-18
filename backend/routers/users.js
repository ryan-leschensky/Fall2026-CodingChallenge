const express = require('express');
const HttpError = require('../lib/http-error');
const { hashPassword } = require('../lib/password');
const Users = require('../models/users');

const router = express.Router();

// Returns an error message for invalid sign-up input, or null when it is valid
const validateSignUp = ({ username, password }) => {
  if (typeof username !== 'string' || !Users.USERNAME_PATTERN.test(username)) {
    return 'username must be 3-30 characters: letters, digits, ".", "_" or "-"';
  }
  if (
    typeof password !== 'string' ||
    password.length < Users.PASSWORD_MIN_LENGTH ||
    password.length > Users.PASSWORD_MAX_LENGTH
  ) {
    return `password must be ${Users.PASSWORD_MIN_LENGTH}-${Users.PASSWORD_MAX_LENGTH} characters`;
  }
  return null;
};

// List all users
router.get('/', async (req, res) => {
  res.json(await Users.listUsers(req.pool));
});

// Look up one user; the username match ignores case
router.get('/:username', async (req, res) => {
  const user = await Users.findUserByUsername(req.pool, req.params.username);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  res.json(user);
});

// Create an account (sign up)
router.post('/', async (req, res) => {
  const { username, password } = req.body ?? {};

  const problem = validateSignUp({ username, password });
  if (problem) {
    throw new HttpError(400, problem);
  }

  try {
    const user = await Users.createUser(req.pool, {
      username,
      passwordHash: await hashPassword(password),
    });
    res
      .status(201)
      .location(`${req.baseUrl}/${encodeURIComponent(user.username)}`)
      .json(user);
  } catch (err) {
    if (err instanceof Users.UsernameTakenError) {
      throw new HttpError(409, err.message);
    }
    throw err;
  }
});

module.exports = router;
