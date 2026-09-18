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
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username":');

    expect(response.statusCode).toBe(400);
  });
});
