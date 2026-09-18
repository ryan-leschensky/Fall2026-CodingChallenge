const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../index');
const { pool } = require('../db/db');

afterAll(() => pool.end());

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

// These hit the PostgreSQL database in DATABASE_URL and are skipped when it is not set
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Login', () => {
  // Unique per run so reruns and leftover rows cannot collide
  const username = `Login_${Date.now().toString(36)}`;
  const password = 'correct horse battery';

  beforeAll(async () => {
    await pool.query(fs.readFileSync(path.join(__dirname, '../seed/queries.sql'), 'utf8'));
    await request(app).post('/api/users').send({ username, password }).expect(201);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  });

  test('Should log in with any username casing and the right password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: username.toLowerCase(), password });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      id: expect.any(Number),
      username,
      createdAt: expect.any(String),
    });
  });

  test.each([
    ['wrong password', () => ({ username, password: 'wrong password' })],
    ['unknown user', () => ({ username: 'nobody-by-this-name', password })],
  ])('Login with %s returns the same 401', async (_, body) => {
    const response = await request(app).post('/api/auth/login').send(body());

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ message: 'Invalid username or password' });
  });
});
