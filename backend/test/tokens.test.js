const jwt = require('jsonwebtoken');
const Tokens = require('../lib/tokens');

const user = { id: 42, username: 'Alice' };
const secret = process.env.JWT_SECRET;

// Signs a token with the same claims as signAccessToken, overriding the given options
const forge = (options, key = secret) =>
  jwt.sign({ username: user.username }, key, {
    algorithm: 'HS256',
    expiresIn: 60,
    issuer: 'fall2026-coding-challenge',
    audience: 'fall2026-coding-challenge-api',
    subject: String(user.id),
    ...options,
  });

describe('Access tokens', () => {
  test('Round-trips the user id and username', () => {
    const token = Tokens.signAccessToken(user);

    expect(Tokens.verifyAccessToken(token)).toEqual(user);
    expect(jwt.decode(token)).toMatchObject({
      sub: '42',
      exp: expect.any(Number),
      iat: expect.any(Number),
    });
  });

  test('Expires after the access token lifetime', () => {
    const { iat, exp } = jwt.decode(Tokens.signAccessToken(user));

    expect(exp - iat).toBe(Tokens.ACCESS_TOKEN_TTL_SECONDS);
  });

  test.each([
    ['expired', () => forge({ expiresIn: -10 })],
    ['signed with another secret', () => forge({}, 'another-secret-that-is-32-bytes-long!!')],
    ['for another audience', () => forge({ audience: 'someone-else' })],
    ['from another issuer', () => forge({ issuer: 'someone-else' })],
    ['using another algorithm', () => forge({ algorithm: 'HS512' })],
    ['unsigned (alg "none")', () => forge({ algorithm: 'none' }, null)],
    ['with a non-numeric subject', () => forge({ subject: 'admin' })],
    ['tampered with', () => Tokens.signAccessToken(user).replace(/\.[^.]+\./, '.e30.')],
    ['not a JWT', () => 'not-a-jwt'],
  ])('Rejects a token %s', (_, token) => {
    expect(Tokens.verifyAccessToken(token())).toBeNull();
  });
});

describe('Signing secret', () => {
  afterEach(() => {
    process.env.JWT_SECRET = secret;
  });

  test.each([undefined, '', 'too-short'])('Refuses to run with JWT_SECRET=%j', value => {
    if (value === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = value;
    }

    expect(() => Tokens.assertConfigured()).toThrow(/JWT_SECRET/);
    expect(() => Tokens.signAccessToken(user)).toThrow(/JWT_SECRET/);
  });
});

describe('Refresh tokens', () => {
  test('Are random, URL-safe and hashed deterministically', () => {
    const [first, second] = [Tokens.generateRefreshToken(), Tokens.generateRefreshToken()];

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Tokens.hashRefreshToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(Tokens.hashRefreshToken(first)).toBe(Tokens.hashRefreshToken(first));
    expect(Tokens.hashRefreshToken(first)).not.toBe(Tokens.hashRefreshToken(second));
  });
});
