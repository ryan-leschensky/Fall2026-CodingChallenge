const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../index');
const { pool } = require('../db/db');

afterAll(() => pool.end());

describe('Sign-up validation', () => {
  test.each([
    {},
    { username: 'alice' },
    { password: 'password123' },
    { username: 'al', password: 'password123' },
    { username: 'a'.repeat(31), password: 'password123' },
    { username: 'has space', password: 'password123' },
    { username: 'alice', password: 'short' },
    { username: 'alice', password: 'p'.repeat(129) },
    { username: 1, password: 12345678 },
  ])('Should reject invalid sign-up %j', async data => {
    const response = await request(app).post('/api/users').send(data);

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toEqual(expect.any(String));
  });
});

// These hit the PostgreSQL database in DATABASE_URL and are skipped when it is not set
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('User accounts', () => {
  // Unique per run so reruns and leftover rows cannot collide
  const username = `Alice_${Date.now().toString(36)}`;
  const password = 'correct horse battery';

  beforeAll(async () => {
    await pool.query(fs.readFileSync(path.join(__dirname, '../seed/users.sql'), 'utf8'));
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  });

  test('Should sign up a new user', async () => {
    const response = await request(app).post('/api/users').send({ username, password });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/api/users/${username}`);
    expect(response.body).toEqual({
      id: expect.any(Number),
      username,
      createdAt: expect.any(String),
    });
    expect(Date.parse(response.body.createdAt)).not.toBeNaN();
  });

  test('Should store a hash, not the password', async () => {
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE username = $1', [
      username,
    ]);

    expect(rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(rows[0].password_hash).not.toContain(password);
  });

  test.each([username, username.toLowerCase(), username.toUpperCase()])(
    'Should reject %s as already taken',
    async taken => {
      const response = await request(app)
        .post('/api/users')
        .send({ username: taken, password: 'another password' });

      expect(response.statusCode).toBe(409);
    },
  );

  test('Should find the user regardless of case', async () => {
    const response = await request(app).get(`/api/users/${username.toUpperCase()}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.username).toBe(username);
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  test('Unknown user returns 404', async () => {
    const response = await request(app).get('/api/users/nobody-by-this-name');

    expect(response.statusCode).toBe(404);
  });

  test('Should list users without password hashes', async () => {
    const response = await request(app).get('/api/users');

    expect(response.statusCode).toBe(200);
    expect(response.body).toContainEqual(expect.objectContaining({ username }));
    for (const user of response.body) {
      expect(Object.keys(user).sort()).toEqual(['createdAt', 'id', 'username']);
    }
  });
});
