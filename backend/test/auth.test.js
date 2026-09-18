const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../index');
const { pool } = require('../db/db');
const Tokens = require('../lib/tokens');

afterAll(() => pool.end());

// Creates the tables these tests use, in the same order as seed/seeder.js
const createSchema = async () => {
  for (const file of ['users.sql', 'refresh-tokens.sql']) {
    await pool.query(fs.readFileSync(path.join(__dirname, '../seed', file), 'utf8'));
  }
};

// The refresh token cookie from a response, as "refresh_token=<value>", or undefined
const refreshCookie = response =>
  response.headers['set-cookie']
    ?.find(cookie => cookie.startsWith('refresh_token='))
    ?.split(';')[0];

describe('Login validation', () => {
  test.each([{}, { username: 'alice' }, { username: 'alice', password: 1 }])(
    'Should reject incomplete login %j',
    async data => {
      const response = await request(app).post('/api/auth/login').send(data);

      expect(response.statusCode).toBe(400);
    },
  );

  test('Should reject password exceeding max input length', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'a'.repeat(1025) });

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ message: 'Invalid username or password' });
  });
});

describe('Session validation', () => {
  test('/me without a token returns 401 with a Bearer challenge', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  test.each(['Bearer not-a-jwt', 'Basic YWxpY2U6cGFzc3dvcmQ=', 'Bearer'])(
    '/me with "Authorization: %s" returns 401',
    async header => {
      const response = await request(app).get('/api/auth/me').set('Authorization', header);

      expect(response.statusCode).toBe(401);
    },
  );

  test('Refresh without a cookie returns 401', async () => {
    const response = await request(app).post('/api/auth/refresh');

    expect(response.statusCode).toBe(401);
  });

  test('Logout without a cookie still succeeds and clears the cookie', async () => {
    const response = await request(app).post('/api/auth/logout');

    expect(response.statusCode).toBe(204);
    expect(refreshCookie(response)).toBe('refresh_token=');
  });

  test('CORS allows credentials only for the configured origin', async () => {
    const allowed = await request(app).get('/api/auth/me').set('Origin', 'http://localhost:5173');
    const other = await request(app).get('/api/auth/me').set('Origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// These hit the PostgreSQL database in DATABASE_URL and are skipped when it is not set
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Login', () => {
  // Unique per run so reruns and leftover rows cannot collide
  const username = `Login_${Date.now().toString(36)}`;
  const password = 'correct horse battery';

  beforeAll(async () => {
    await createSchema();
    await request(app).post('/api/users').send({ username, password }).expect(201);
  });

  afterAll(async () => {
    // Cascades to the user's refresh tokens
    await pool.query('DELETE FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  });

  const login = () =>
    request(app).post('/api/auth/login').send({ username: username.toLowerCase(), password });

  test('Should log in with any username casing and the right password', async () => {
    const response = await login();

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      user: { id: expect.any(Number), username, createdAt: expect.any(String) },
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: Tokens.ACCESS_TOKEN_TTL_SECONDS,
    });
    expect(Tokens.verifyAccessToken(response.body.accessToken)).toEqual({
      id: response.body.user.id,
      username,
    });
  });

  test('Should set the refresh token as an httpOnly, SameSite=Strict cookie scoped to auth', async () => {
    const response = await login();
    const cookie = response.headers['set-cookie'].find(c => c.startsWith('refresh_token='));

    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(cookie).toMatch(/; Path=\/api\/auth(;|$)/);
    expect(cookie).toMatch(/; Expires=/);
  });

  test('Should store only a hash of the refresh token', async () => {
    const cookie = refreshCookie(await login());
    const token = cookie.split('=')[1];
    const { rows } = await pool.query(
      'SELECT token_hash FROM refresh_tokens WHERE token_hash = $1',
      [Tokens.hashRefreshToken(token)],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toContain(token);
  });

  test.each([
    ['wrong password', () => ({ username, password: 'wrong password' })],
    ['unknown user', () => ({ username: 'nobody-by-this-name', password })],
  ])('Login with %s returns the same 401', async (_, body) => {
    const response = await request(app).post('/api/auth/login').send(body());

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ message: 'Invalid username or password' });
    expect(refreshCookie(response)).toBeUndefined();
  });

  test('/me returns the user for a valid access token', async () => {
    const { body } = await login();
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(body.user);
  });
});

describeDb('Session refresh and logout', () => {
  const username = `Session_${Date.now().toString(36)}`;
  const password = 'correct horse battery';

  beforeAll(async () => {
    await createSchema();
    await request(app).post('/api/users').send({ username, password }).expect(201);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  });

  const login = async () =>
    refreshCookie(await request(app).post('/api/auth/login').send({ username, password }));

  const refresh = cookie => request(app).post('/api/auth/refresh').set('Cookie', cookie);

  test('Refresh issues a new access token and rotates the refresh token', async () => {
    const cookie = await login();
    const response = await refresh(cookie);

    expect(response.statusCode).toBe(200);
    expect(response.body.user.username).toBe(username);
    expect(Tokens.verifyAccessToken(response.body.accessToken)).not.toBeNull();
    expect(refreshCookie(response)).toMatch(/^refresh_token=.+/);
    expect(refreshCookie(response)).not.toBe(cookie);
  });

  test('Reusing a rotated refresh token revokes the whole session', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const original = await login();
    const rotated = refreshCookie(await refresh(original));

    const replay = await refresh(original);
    expect(replay.statusCode).toBe(401);
    expect(refreshCookie(replay)).toBe('refresh_token=');

    // The legitimate holder's newer token is now dead too
    expect((await refresh(rotated)).statusCode).toBe(401);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/reuse detected/));
    warn.mockRestore();
  });

  test('Concurrent refreshes with one token cannot both succeed', async () => {
    // The losing request looks like a replay, which is logged
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const cookie = await login();
    const statuses = (await Promise.all([refresh(cookie), refresh(cookie)])).map(r => r.statusCode);

    expect(statuses).toContain(401);
    expect(statuses.filter(status => status === 200).length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });

  test('Other sessions survive when one is revoked', async () => {
    const [first, second] = [await login(), await login()];

    await request(app).post('/api/auth/logout').set('Cookie', first).expect(204);

    expect((await refresh(first)).statusCode).toBe(401);
    expect((await refresh(second)).statusCode).toBe(200);
  });

  test('An expired refresh token is rejected', async () => {
    const cookie = await login();
    await pool.query(
      `UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1`,
      [Tokens.hashRefreshToken(cookie.split('=')[1])],
    );

    expect((await refresh(cookie)).statusCode).toBe(401);
  });

  test('Rotation never extends a session past its absolute expiry', async () => {
    const cookie = await login();
    await pool.query(
      `UPDATE refresh_tokens SET session_expires_at = now() + interval '1 hour'
       WHERE token_hash = $1`,
      [Tokens.hashRefreshToken(cookie.split('=')[1])],
    );

    const rotated = refreshCookie(await refresh(cookie));
    const { rows } = await pool.query(
      `SELECT expires_at <= now() + interval '1 hour' AS capped
       FROM refresh_tokens WHERE token_hash = $1`,
      [Tokens.hashRefreshToken(rotated.split('=')[1])],
    );

    expect(rows[0].capped).toBe(true);
  });
});
