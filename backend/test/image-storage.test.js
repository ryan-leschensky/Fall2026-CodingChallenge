const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../index');
const { pool } = require('../db/db');
const Tokens = require('../lib/tokens');
const { makePng, fakeFetch, imageResponse } = require('./helpers/fake-images');

afterAll(() => pool.end());

// Creates the tables these tests use, in the same order as seed/seeder.js
const createSchema = async () => {
  for (const file of [
    'users.sql',
    'refresh-tokens.sql',
    'collections.sql',
    'collection-images.sql',
  ]) {
    await pool.query(fs.readFileSync(path.join(__dirname, '../seed', file), 'utf8'));
  }
};

// These hit the PostgreSQL database in DATABASE_URL and are skipped when it is not set
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('Saving images from allowed hosts', () => {
  const suffix = Date.now().toString(36);
  let user;
  let auth;
  let imagesUrl;
  let fetchMock;

  const pixabay = {
    imageUrl: 'https://pixabay.com/get/g1234_1280.jpg',
    thumbnailUrl: 'https://cdn.pixabay.com/photo/2026/01/01/lake_150.jpg',
    pageUrl: 'https://pixabay.com/photos/lake-1234/',
    source: 'pixabay',
    sourceId: 1234,
    // Wrong on purpose: the stored copy's real size should win
    width: 1,
    height: 1,
  };

  beforeAll(async () => {
    await createSchema();
    const response = await request(app)
      .post('/api/users')
      .send({ username: `media_${suffix}`, password: 'correct horse battery' })
      .expect(201);
    user = response.body;
    auth = { Authorization: `Bearer ${Tokens.signAccessToken(user)}` };
    const { body: collection } = await request(app)
      .post('/api/collections')
      .set(auth)
      .send({ name: 'Stored' })
      .expect(201);
    imagesUrl = `/api/collections/${collection.id}/images`;
  });

  afterEach(() => fetchMock?.restore());

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
  });

  test('Should store copies and point the saved image at them', async () => {
    fetchMock = fakeFetch({
      [pixabay.imageUrl]: imageResponse(makePng(1280, 853, suffix)),
      [pixabay.thumbnailUrl]: imageResponse(makePng(150, 100, `${suffix}-thumb`)),
    });

    const response = await request(app).post(imagesUrl).set(auth).send(pixabay);

    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({
      imageUrl: expect.stringMatching(/^http:\/\/localhost:3000\/media\/images\/.+\.png$/),
      thumbnailUrl: expect.stringMatching(/^http:\/\/localhost:3000\/media\/images\/.+\.png$/),
      originalUrl: pixabay.imageUrl,
      pageUrl: pixabay.pageUrl,
      width: 1280,
      height: 853,
    });
    expect(response.body.thumbnailUrl).not.toBe(response.body.imageUrl);
  });

  test('Should serve the stored copy so another origin can show it', async () => {
    const { body: images } = await request(app).get(imagesUrl).set(auth);
    const mediaPath = new URL(images[0].imageUrl).pathname;

    const response = await request(app).get(mediaPath);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(response.headers['cache-control']).toMatch(/immutable/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  test('Should 404 a media file that does not exist, as JSON', async () => {
    const response = await request(app).get('/media/images/00/missing.png');

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ message: expect.any(String) });
  });

  test('Should refuse the same bytes twice, even from a different URL', async () => {
    const again = 'https://pixabay.com/get/g1234_other.jpg';
    fetchMock = fakeFetch({ [again]: imageResponse(makePng(1280, 853, suffix)) });

    const response = await request(app)
      .post(imagesUrl)
      .set(auth)
      .send({ imageUrl: again, source: 'pixabay' });

    expect(response.statusCode).toBe(409);
  });

  test('Should save without a thumbnail when only the thumbnail fails', async () => {
    const imageUrl = 'https://pixabay.com/get/g5678_1280.jpg';
    const thumbnailUrl = 'https://cdn.pixabay.com/photo/broken_150.jpg';
    fetchMock = fakeFetch({
      [imageUrl]: imageResponse(makePng(800, 600, `${suffix}-2`)),
      [thumbnailUrl]: imageResponse('gone', { status: 404 }),
    });

    const response = await request(app)
      .post(imagesUrl)
      .set(auth)
      .send({ imageUrl, thumbnailUrl, source: 'pixabay' });

    expect(response.statusCode).toBe(201);
    expect(response.body.thumbnailUrl).toBeNull();
  });

  test('Should tell the client when the image cannot be downloaded', async () => {
    const imageUrl = 'https://pixabay.com/get/expired.jpg';
    fetchMock = fakeFetch({ [imageUrl]: imageResponse('expired', { status: 403 }) });

    const response = await request(app).post(imagesUrl).set(auth).send({ imageUrl });

    expect(response.statusCode).toBe(502);
    expect(response.body.message).toMatch(/Could not download the image from pixabay\.com/);
  });

  test('Should not download from other hosts, and save them as links', async () => {
    fetchMock = fakeFetch({});

    const response = await request(app)
      .post(imagesUrl)
      .set(auth)
      .send({ imageUrl: 'http://169.254.169.254/latest/meta-data/' });

    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({
      imageUrl: 'http://169.254.169.254/latest/meta-data/',
      originalUrl: null,
    });
    expect(fetchMock.requested).toHaveLength(0);
  });
});
