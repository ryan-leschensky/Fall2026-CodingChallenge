const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../index');
const { pool } = require('../db/db');
const Tokens = require('../lib/tokens');
const Pixabay = require('../lib/pixabay');

afterAll(() => pool.end());

// A Pixabay API hit, as documented at https://pixabay.com/api/docs/
const hit = id => ({
  id,
  pageURL: `https://pixabay.com/photos/lake-${id}/`,
  tags: 'lake, mountains, reflection',
  previewURL: `https://cdn.pixabay.com/photo/${id}_150.jpg`,
  webformatURL: `https://pixabay.com/get/${id}_640.jpg`,
  webformatWidth: 640,
  webformatHeight: 427,
  largeImageURL: `https://pixabay.com/get/${id}_1280.jpg`,
  imageWidth: 6000,
  imageHeight: 4000,
  user: 'photographer',
});

/**
 * Replaces fetch with a fake Pixabay API. respond(url) returns the Response for each request.
 * Returns the URLs that were requested.
 */
const fakePixabay = respond => {
  const requested = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const parsed = new URL(String(url));
    requested.push(parsed);
    return respond(parsed);
  });
  return requested;
};

const results = (hits, totalHits = hits.length) =>
  Response.json({ total: totalHits, totalHits, hits });

afterEach(() => {
  jest.restoreAllMocks();
  Pixabay.clearCache();
});

describe('Pixabay client', () => {
  test('Should ask for safe-search photos and map results to image fields', async () => {
    const requested = fakePixabay(() => results([hit(1)], 250));

    const found = await Pixabay.searchImages({ query: '  Mountain Lake ', page: 2, perPage: 10 });

    expect(Object.fromEntries(requested[0].searchParams)).toEqual({
      key: 'test-pixabay-key',
      q: 'mountain lake',
      image_type: 'photo',
      safesearch: 'true',
      page: '2',
      per_page: '10',
    });
    expect(found).toEqual({
      total: 250,
      results: [
        {
          source: 'pixabay',
          sourceId: '1',
          imageUrl: 'https://pixabay.com/get/1_1280.jpg',
          thumbnailUrl: 'https://cdn.pixabay.com/photo/1_150.jpg',
          previewUrl: 'https://pixabay.com/get/1_640.jpg',
          previewWidth: 640,
          previewHeight: 427,
          pageUrl: 'https://pixabay.com/photos/lake-1/',
          width: 6000,
          height: 4000,
          tags: ['lake', 'mountains', 'reflection'],
          author: 'photographer',
        },
      ],
    });
  });

  test('Should report at most the 500 results Pixabay lets a search page through', async () => {
    fakePixabay(() => results([hit(1)], 12000));

    expect((await Pixabay.searchImages({ query: 'sky', page: 1, perPage: 20 })).total).toBe(500);
  });

  test('Should answer the same search from its cache, ignoring case and spacing', async () => {
    const requested = fakePixabay(() => results([hit(1)]));

    await Pixabay.searchImages({ query: 'Lake', page: 1, perPage: 20 });
    await Pixabay.searchImages({ query: ' lake', page: 1, perPage: 20 });
    await Pixabay.searchImages({ query: 'lake', page: 2, perPage: 20 });

    expect(requested).toHaveLength(2);
  });

  test('Should not ask Pixabay for pages past the first 500 results', async () => {
    const requested = fakePixabay(() => results([]));

    const found = await Pixabay.searchImages({ query: 'lake', page: 26, perPage: 20 });

    expect(found).toEqual({ total: null, results: [] });
    expect(requested).toHaveLength(0);
  });

  test('Should return no results for a page Pixabay says is out of range', async () => {
    fakePixabay(() => new Response('[ERROR 400] "page" is out of valid range.', { status: 400 }));

    expect(await Pixabay.searchImages({ query: 'lake', page: 9, perPage: 20 })).toEqual({
      total: null,
      results: [],
    });
  });

  test.each([
    ['Pixabay is down', () => Promise.reject(new TypeError('fetch failed')), 502],
    [
      'the key is rejected',
      () => new Response('[ERROR 400] Invalid API key', { status: 400 }),
      502,
    ],
    ['the reply is not JSON', () => new Response('<html>', { status: 200 }), 502],
    ['the allowance is used up', () => new Response('Too many', { status: 429 }), 503],
  ])('Should fail with %s, without leaking the key', async (label, respond, status) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fakePixabay(respond);

    const err = await Pixabay.searchImages({ query: 'lake', page: 1, perPage: 20 }).catch(e => e);

    expect(err.status).toBe(status);
    expect(err.expose).toBe(true);
    expect(err.message).not.toContain('test-pixabay-key');
    for (const [message] of console.error.mock.calls) {
      expect(String(message)).not.toContain('test-pixabay-key');
    }
  });

  test.each([undefined, '', 'CHANGE_ME'])('Should refuse to start with key %p', key => {
    const saved = process.env.PIXABAY_API_KEY;
    try {
      if (key === undefined) {
        delete process.env.PIXABAY_API_KEY;
      } else {
        process.env.PIXABAY_API_KEY = key;
      }
      expect(Pixabay.assertConfigured).toThrow(/PIXABAY_API_KEY/);
    } finally {
      process.env.PIXABAY_API_KEY = saved;
    }
  });
});

describe('GET /api/search/images validation', () => {
  const token = Tokens.signAccessToken({ id: 1, username: 'someone' });

  test('Should require logging in', async () => {
    expect((await request(app).get('/api/search/images?q=lake')).statusCode).toBe(401);
  });

  test.each([
    '',
    '?q=',
    '?q=%20%20',
    `?q=${'a'.repeat(101)}`,
    '?q=lake&limit=2',
    '?q=lake&limit=101',
    '?q=lake&page=0',
    '?q=lake&page=1001',
    '?q=lake&page=abc',
  ])('Should reject %s', async query => {
    const response = await request(app)
      .get(`/api/search/images${query}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(400);
  });
});

// These hit the PostgreSQL database in DATABASE_URL and are skipped when it is not set
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('GET /api/search/images', () => {
  const suffix = Date.now().toString(36);
  let user;
  let auth;
  let collection;

  beforeAll(async () => {
    for (const file of [
      'users.sql',
      'refresh-tokens.sql',
      'collections.sql',
      'collection-images.sql',
    ]) {
      await pool.query(fs.readFileSync(path.join(__dirname, '../seed', file), 'utf8'));
    }
    const { body } = await request(app)
      .post('/api/users')
      .send({ username: `search_${suffix}`, password: 'correct horse battery' })
      .expect(201);
    user = body;
    auth = { Authorization: `Bearer ${Tokens.signAccessToken(user)}` };
    ({ body: collection } = await request(app)
      .post('/api/collections')
      .set(auth)
      .send({ name: 'Lakes' })
      .expect(201));
    // Saved as a link (example.com is not an allowed host), so nothing is downloaded
    await request(app)
      .post(`/api/collections/${collection.id}/images`)
      .set(auth)
      .send({ imageUrl: 'https://example.com/lake.jpg', source: 'pixabay', sourceId: `9${suffix}` })
      .expect(201);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
  });

  test('Should return results with the total and which collections already have each', async () => {
    const savedId = `9${suffix}`;
    fakePixabay(() => results([{ ...hit(1), id: savedId }, hit(2)], 42));

    const response = await request(app).get('/api/search/images?q=lake&limit=5').set(auth);

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-total-count']).toBe('42');
    expect(response.body.map(r => [r.sourceId, r.savedIn])).toEqual([
      [savedId, [collection.id]],
      ['2', []],
    ]);
  });

  test('Should send the result fields that saving an image accepts', async () => {
    fakePixabay(() => results([hit(3)]));
    const { body: found } = await request(app).get('/api/search/images?q=lake').set(auth);
    const { imageUrl, thumbnailUrl, pageUrl, source, sourceId, width, height, tags } = found[0];

    // Saving a real Pixabay URL would download it; this checks the fields validate as they are
    const response = await request(app)
      .post(`/api/collections/${collection.id}/images`)
      .set(auth)
      .send({
        imageUrl: imageUrl.replace('pixabay.com', 'example.com'),
        thumbnailUrl,
        pageUrl,
        source,
        sourceId,
        width,
        height,
        tags,
      });

    expect(response.statusCode).toBe(201);
  });

  test('Should leave out the total for a page past the end', async () => {
    fakePixabay(() => results([]));

    const response = await request(app).get('/api/search/images?q=lake&page=100').set(auth);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]);
    expect(response.headers['x-total-count']).toBeUndefined();
  });
});
