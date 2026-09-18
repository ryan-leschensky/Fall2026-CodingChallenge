const express = require('express');
const HttpError = require('../lib/http-error');
const { hashPassword } = require('../lib/password');
const Users = require('../models/users');

const router = express.Router();

/**
 * Ensures that the given username and password are valid for registering a new account. This
 * should be called whenever a new account is being created.
 * @param param0            Passed json object containing a username and password field
 * @param param0.username   String username that the user wants to use for their account (must be
 *                          unique)
 * @param param0.password   Plaintext password that the user wants to use for their account
 * @returns {null|string}   An error message if there is an issue with the username or
 *                          password.
 */
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

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Retrieve all users
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   username:
 *                     type: string
 */
router.get('/', async (req, res) => {
  res.json(await Users.listUsers(req.pool));
});

/**
 * @openapi
 * /api/users/{username}:
 *   get:
 *     summary: Get a user by username
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username of the user to retrieve
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 username:
 *                   type: string
 *       404:
 *         description: User not found
 */
router.get('/:username', async (req, res) => {
  const user = await Users.findUserByUsername(req.pool, req.params.username);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  res.json(user);
});

/**
 * @openapi
 * /api/users:
 *   post:
 *     summary: Create a new user account (sign up)
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User successfully created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 username:
 *                   type: string
 *       400:
 *         description: Validation error
 *       409:
 *         description: Username already taken
 */
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
