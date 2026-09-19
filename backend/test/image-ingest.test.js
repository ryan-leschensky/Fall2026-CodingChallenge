const fs = require('node:fs');
const path = require('node:path');
const { isAllowedSource, ingestImage } = require('../lib/image-ingest');
const { readMediaConfig } = require('../lib/media-config');
const createS3Driver = require('../storage/s3-driver');
const { makePng, fakeFetch, imageResponse, redirect } = require('./helpers/fake-images');

const SOURCE = 'https://pixabay.com/get/photo.png';

let fetchMock;
afterEach(() => fetchMock?.restore());

// Runs ingestImage and returns the HttpError it throws
const ingestError = async url => {
  const err = await ingestImage(url).catch(e => e);
  expect(err).toBeInstanceOf(Error);
  return err;
};

describe('Allowed image sources', () => {
  test.each([
    'https://pixabay.com/get/a.jpg',
    'https://cdn.pixabay.com/photo/a.jpg',
    'https://PIXABAY.COM/a.jpg',
  ])('Should download from %s', url => {
    expect(isAllowedSource(url)).toBe(true);
  });

  test.each([
    'http://pixabay.com/a.jpg',
    'https://evilpixabay.com/a.jpg',
    'https://pixabay.com.evil.example/a.jpg',
    'https://169.254.169.254/latest/meta-data/',
    'https://localhost/a.jpg',
    'not a url',
  ])('Should not download from %s', url => {
    expect(isAllowedSource(url)).toBe(false);
  });
});

describe('Downloading and storing an image', () => {
  test('Should store the image under a hash of its bytes and report its real size', async () => {
    const bytes = makePng(640, 427, 'store');
    fetchMock = fakeFetch({ [SOURCE]: imageResponse(bytes, { contentType: 'image/jpeg' }) });

    const stored = await ingestImage(SOURCE);

    expect(stored).toEqual({
      url: expect.stringMatching(
        /^http:\/\/localhost:3000\/media\/images\/[0-9a-f]{2}\/[0-9a-f]{64}\.png$/,
      ),
      width: 640,
      height: 427,
      contentType: 'image/png',
      bytes: bytes.length,
    });
    const key = stored.url.slice('http://localhost:3000/media/'.length);
    expect(fs.readFileSync(path.join(readMediaConfig().dir, key))).toEqual(bytes);
  });

  test('Should store the same bytes once, whatever URL they came from', async () => {
    const bytes = makePng(10, 10, 'same');
    const other = 'https://cdn.pixabay.com/elsewhere.png';
    fetchMock = fakeFetch({ [SOURCE]: imageResponse(bytes), [other]: imageResponse(bytes) });

    const first = await ingestImage(SOURCE);
    const second = await ingestImage(other);

    expect(second.url).toBe(first.url);
  });

  test('Should follow redirects that stay on allowed hosts', async () => {
    const final = 'https://cdn.pixabay.com/final.png';
    fetchMock = fakeFetch({
      [SOURCE]: redirect('https://cdn.pixabay.com/final.png'),
      [final]: imageResponse(makePng(5, 5, 'redirected')),
    });

    expect((await ingestImage(SOURCE)).width).toBe(5);
    expect(fetchMock.requested.map(r => r.options.redirect)).toEqual(['manual', 'manual']);
  });

  test('Should refuse a redirect to a host that is not allowed', async () => {
    fetchMock = fakeFetch({ [SOURCE]: redirect('http://169.254.169.254/latest/meta-data/') });

    const err = await ingestError(SOURCE);

    expect(err.status).toBe(400);
    expect(fetchMock.requested).toHaveLength(1);
  });

  test('Should give up after too many redirects', async () => {
    fetchMock = fakeFetch({ [SOURCE]: () => redirect(SOURCE) });

    const err = await ingestError(SOURCE);

    expect(err.status).toBe(502);
    expect(err.expose).toBe(true);
  });

  test.each([
    ['text pretending to be a PNG', Buffer.from('<html>not an image</html>'), 'image/png'],
    [
      'an SVG, which can carry scripts',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
      'image/svg+xml',
    ],
  ])('Should refuse %s with a 415', async (label, body, contentType) => {
    fetchMock = fakeFetch({ [SOURCE]: imageResponse(body, { contentType }) });

    expect((await ingestError(SOURCE)).status).toBe(415);
  });

  test('Should refuse an image that says it is too large, without reading it', async () => {
    const limit = readMediaConfig().maxBytes;
    fetchMock = fakeFetch({
      [SOURCE]: imageResponse(makePng(1, 1), { headers: { 'Content-Length': String(limit + 1) } }),
    });

    expect((await ingestError(SOURCE)).status).toBe(413);
  });

  test('Should stop reading an image that turns out too large', async () => {
    process.env.MEDIA_MAX_BYTES = '100';
    try {
      // A stream has no Content-Length, so only the running total can catch it
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(makePng(1, 1));
          controller.enqueue(new Uint8Array(200));
          controller.close();
        },
      });
      fetchMock = fakeFetch({ [SOURCE]: () => imageResponse(stream) });

      expect((await ingestError(SOURCE)).status).toBe(413);
    } finally {
      delete process.env.MEDIA_MAX_BYTES;
    }
  });

  test.each([
    ['the host answers 404', { [SOURCE]: imageResponse('gone', { status: 404 }) }, /answered 404/],
    ['the host cannot be reached', { [SOURCE]: new TypeError('fetch failed') }, /no response/],
    [
      'the host is too slow',
      { [SOURCE]: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) },
      /too long/,
    ],
  ])(
    'Should answer 502 with a message the client can see when %s',
    async (label, routes, message) => {
      fetchMock = fakeFetch(routes);

      const err = await ingestError(SOURCE);

      expect(err.status).toBe(502);
      expect(err.expose).toBe(true);
      expect(err.message).toMatch(message);
    },
  );
});

describe('Media settings', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  test('Should require the bucket settings for S3', () => {
    process.env.STORAGE_DRIVER = 's3';

    expect(readMediaConfig).toThrow(/S3_BUCKET[\s\S]*S3_ACCESS_KEY_ID[\s\S]*S3_PUBLIC_BASE_URL/);
  });

  test.each([
    [{ STORAGE_DRIVER: 'ftp' }, /STORAGE_DRIVER/],
    [{ MEDIA_MAX_BYTES: 'lots' }, /MEDIA_MAX_BYTES/],
    [{ MEDIA_FETCH_TIMEOUT_MS: '-1' }, /MEDIA_FETCH_TIMEOUT_MS/],
  ])('Should reject %j', (env, message) => {
    Object.assign(process.env, env);

    expect(readMediaConfig).toThrow(message);
  });

  test('Should resolve a relative MEDIA_DIR against the backend folder', () => {
    process.env.MEDIA_DIR = 'uploads';

    expect(readMediaConfig().dir).toBe(path.resolve(__dirname, '..', 'uploads'));
  });
});

describe('S3 storage', () => {
  const config = {
    s3: {
      bucket: 'photos',
      region: 'auto',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
      publicBaseUrl: 'https://cdn.example.com',
    },
  };

  const driverWith = send => createS3Driver(config, { client: { send } });

  test('Should report a missing object as not existing', async () => {
    const notFound = Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } });
    const driver = driverWith(jest.fn().mockRejectedValue(notFound));

    expect(await driver.exists('images/ab/abc.png')).toBe(false);
  });

  test('Should not hide other S3 errors', async () => {
    const denied = Object.assign(new Error('AccessDenied'), { $metadata: { httpStatusCode: 403 } });
    const driver = driverWith(jest.fn().mockRejectedValue(denied));

    await expect(driver.exists('images/ab/abc.png')).rejects.toThrow('AccessDenied');
  });

  test('Should upload with the content type and a long cache lifetime', async () => {
    const send = jest.fn().mockResolvedValue({});
    const driver = driverWith(send);

    await driver.put({
      key: 'images/ab/abc.png',
      body: Buffer.from('x'),
      contentType: 'image/png',
    });

    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'photos',
      Key: 'images/ab/abc.png',
      Body: Buffer.from('x'),
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(driver.publicUrl('images/ab/abc.png')).toBe('https://cdn.example.com/images/ab/abc.png');
  });
});
