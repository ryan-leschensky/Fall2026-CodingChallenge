const express = require('express');
const request = require('supertest');
const app = require('../index');
const { createRateLimit } = require('../middleware/rate-limit');

// A tiny app with one limited route, so the limiter can be tested without the database
const limitedApp = options => {
  const testApp = express();
  testApp.use((req, res, next) => {
    req.user = { id: Number(req.get('X-User') ?? 1) };
    next();
  });
  testApp.get(
    '/',
    createRateLimit({ windowMs: 60_000, message: 'Slow down', ...options }),
    (req, res) => res.json({ ok: true }),
  );
  return testApp;
};

describe('Rate limits', () => {
  test('Should allow requests up to the limit, then 429 with the usual error shape', async () => {
    const testApp = limitedApp({ limit: 2 });

    expect((await request(testApp).get('/')).statusCode).toBe(200);
    const last = await request(testApp).get('/');
    const over = await request(testApp).get('/');

    expect(last.statusCode).toBe(200);
    expect(last.headers.ratelimit).toMatch(/r=0/);
    expect(over.statusCode).toBe(429);
    expect(over.body).toEqual({ message: 'Slow down' });
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
  });

  test('Should count each key separately', async () => {
    const testApp = limitedApp({ limit: 1, keyGenerator: req => `user:${req.user.id}` });

    expect((await request(testApp).get('/').set('X-User', '1')).statusCode).toBe(200);
    expect((await request(testApp).get('/').set('X-User', '1')).statusCode).toBe(429);
    expect((await request(testApp).get('/').set('X-User', '2')).statusCode).toBe(200);
  });

  test('Should not count skipped requests', async () => {
    const testApp = limitedApp({ limit: 1, skip: () => true });

    for (let i = 0; i < 3; i++) {
      expect((await request(testApp).get('/')).statusCode).toBe(200);
    }
  });
});

describe('Security headers', () => {
  test('API responses should carry helmet headers', async () => {
    const response = await request(app).get('/api/collections');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toEqual(expect.any(String));
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  test('The API docs should still load', async () => {
    const response = await request(app).get('/api-docs/');

    expect(response.statusCode).toBe(200);
    expect(response.text).toMatch(/swagger-ui/);
  });
});
