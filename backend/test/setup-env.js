/**
 * Used for testing only
 * @type {string}   set string of at least 32 bytes for consistent testing
 */
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-bytes-long';
process.env.SHARE_LINK_SECRET = 'test-share-link-secret-at-least-32-bytes';
// Never sent anywhere: tests replace fetch
process.env.PIXABAY_API_KEY = 'test-pixabay-key';

// Saved images go to a temporary folder, never the real media folder, and only the default
// allowed host is downloaded from (tests replace fetch, so nothing is actually downloaded)
process.env.STORAGE_DRIVER = 'local';
process.env.MEDIA_DIR = require('node:path').join(
  require('node:os').tmpdir(),
  'fall2026-test-media',
);
process.env.MEDIA_BASE_URL = 'http://localhost:3000/media';
process.env.MEDIA_ALLOWED_HOSTS = 'pixabay.com';
