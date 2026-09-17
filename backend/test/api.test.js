const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../index');
const { pool } = require('../db/db');

afterAll(() => pool.end());

describe('API without a database', () => {
  test('Unknown routes return 404', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ message: 'Not Found' });
  });

  test('Malformed JSON returns 400', async () => {
    const response = await request(app)
      .post('/api/users')
      .set('Content-Type', 'application/json')
      .send('{"name":');

    expect(response.statusCode).toBe(400);
  });

  test.each([{}, { name: 'Name' }, { name: ' ', lastname: 'Lastname' }, { name: 1, lastname: 2 }])(
    'Should reject invalid user %j',
    async data => {
      const response = await request(app).post('/api/users').send(data);

      expect(response.statusCode).toBe(400);
    },
  );
});

// These hit the PostgreSQL database in DATABASE_URL and are skipped when it is not set
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Testing Route /api/users', () => {
  const createdIds = [];

  beforeAll(async () => {
    await pool.query(fs.readFileSync(path.join(__dirname, '../seed/queries.sql'), 'utf8'));
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdIds]);
  });

  test('Should add new user', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ name: 'Name', lastname: 'Lastname' });

    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual({ id: expect.any(Number), name: 'Name', lastname: 'Lastname' });
    createdIds.push(response.body.id);
  });

  test('Should get all users', async () => {
    const result = await pool.query('SELECT id, name, lastname FROM users ORDER BY id');

    const response = await request(app).get('/api/users');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(result.rows);
  });
});
