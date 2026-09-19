const { rateLimit } = require('express-rate-limit');

const MINUTE = 60 * 1000;

/**
 * Builds a rate limiter. Requests are counted per client IP unless keyGenerator says otherwise,
 * in memory, so the counts reset when the server restarts and are not shared between servers.
 * Over the limit, the response is a 429 in the same { message } shape as every other error, with
 * RateLimit and Retry-After headers telling the client when to try again.
 * @param {object} options
 * @param {number} options.windowMs         How long each count lasts
 * @param {number} options.limit            Requests allowed per window
 * @param {string} options.message          Sent with the 429
 * @param {Function} [options.keyGenerator] What to count by, when not the client IP
 * @param {Function} [options.skip]         Requests that are not counted
 */
const createRateLimit = ({ windowMs, limit, message, keyGenerator, skip }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(keyGenerator && { keyGenerator }),
    ...(skip && { skip }),
    handler: (req, res, next, options) => {
      res.status(options.statusCode).json({ message });
    },
  });

// Tests send many requests from one address; the limiter itself is tested on its own
const skipInTests = () => process.env.NODE_ENV === 'test';

// Slows password guessing. Counted per IP so one attacker cannot lock out a real user.
const loginLimit = createRateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: 'Too many login attempts, try again later',
  skip: skipInTests,
});

const signUpLimit = createRateLimit({
  windowMs: 60 * MINUTE,
  limit: 10,
  message: 'Too many accounts created from this address, try again later',
  skip: skipInTests,
});

// Share links work without logging in, so they are the easiest endpoint to hammer
const sharedLimit = createRateLimit({
  windowMs: MINUTE,
  limit: 120,
  message: 'Too many requests, try again in a minute',
  skip: skipInTests,
});

// Counted per user after requireAuth: each search can cost a call to Pixabay, whose key allows
// about 100 requests a minute across every user of this server
const searchLimit = createRateLimit({
  windowMs: MINUTE,
  limit: 30,
  message: 'Too many searches, try again in a minute',
  keyGenerator: req => `user:${req.user.id}`,
  skip: skipInTests,
});

module.exports = { createRateLimit, loginLimit, signUpLimit, sharedLimit, searchLimit };
