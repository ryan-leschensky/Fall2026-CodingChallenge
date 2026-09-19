const HttpError = require('./http-error');

/**
 * Image search through the Pixabay API (https://pixabay.com/api/docs/). The API key stays on this
 * server. Pixabay asks clients to cache results for 24 hours and allows about 100 requests a
 * minute per key, so identical searches are answered from memory.
 */

const API_URL = 'https://pixabay.com/api/';
const QUERY_MAX_LENGTH = 100;
// Pixabay only lets a search page through its first 500 results
const MAX_RESULTS = 500;
const MIN_PER_PAGE = 3;
const MAX_PER_PAGE = 100;
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const TAG_MAX_LENGTH = 50;
const MAX_TAGS = 20;

const cache = new Map();

const getKey = () => {
  const key = process.env.PIXABAY_API_KEY;
  // CHANGE_ME is the placeholder in .env.example
  if (!key || key === 'CHANGE_ME') {
    throw new Error(
      'PIXABAY_API_KEY must be set for image search. Get a free key at https://pixabay.com/api/docs/',
    );
  }
  return key;
};

/**
 * Called at startup so a missing key fails the boot instead of the first search
 */
const assertConfigured = () => {
  getKey();
};

const unavailable = () =>
  new HttpError(502, 'Image search is unavailable right now, try again later', { expose: true });

/**
 * Turns a Pixabay hit into the fields POST /api/collections/:id/images takes, plus what a
 * results page needs to show it.
 */
const toResult = hit => ({
  source: 'pixabay',
  sourceId: String(hit.id),
  // Saved (and so stored) at full size; the preview is for showing results
  imageUrl: hit.largeImageURL,
  thumbnailUrl: hit.previewURL,
  previewUrl: hit.webformatURL,
  previewWidth: hit.webformatWidth,
  previewHeight: hit.webformatHeight,
  pageUrl: hit.pageURL,
  width: hit.imageWidth,
  height: hit.imageHeight,
  tags: String(hit.tags ?? '')
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag && tag.length <= TAG_MAX_LENGTH)
    .slice(0, MAX_TAGS),
  // Pixabay asks that the photographer be credited where their images are shown
  author: hit.user,
});

const readCache = key => {
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.expires <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
};

const writeCache = (key, value) => {
  // Maps keep insertion order, so the first key is the oldest entry
  if (cache.size >= CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
};

/**
 * Searches Pixabay for photos.
 * @param {object} params
 * @param {string} params.query     What to search for, 1-100 characters
 * @param {number} params.page      Page number, from 1
 * @param {number} params.perPage   Results per page, 3-100
 * @returns {Promise<{ total: number|null, results: object[] }>}  total is how many results can be
 *          paged through, or null for a page past the end (which has no results)
 * @throws {HttpError} 502 if Pixabay cannot be reached or rejects the request, 503 when this
 *         server has used up its Pixabay allowance for the minute
 */
const searchImages = async ({ query, page, perPage }) => {
  const q = query.trim().toLowerCase();
  if ((page - 1) * perPage >= MAX_RESULTS) {
    return { total: null, results: [] };
  }

  const cacheKey = JSON.stringify([q, page, perPage]);
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    key: getKey(),
    q,
    image_type: 'photo',
    safesearch: 'true',
    page: String(page),
    per_page: String(perPage),
  });

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    console.error(`Pixabay search failed: ${err.name}`);
    throw unavailable();
  }

  if (response.status === 429) {
    throw new HttpError(503, 'Too many image searches right now, try again in a minute', {
      expose: true,
    });
  }
  if (!response.ok) {
    // Pixabay answers a page past the last result with a 400
    const text = await response.text().catch(() => '');
    if (response.status === 400 && /out of valid range/i.test(text)) {
      return { total: null, results: [] };
    }
    // The response text never includes the key, but the request URL does, so it is not logged
    console.error(`Pixabay search failed: ${response.status} ${text.slice(0, 200)}`);
    throw unavailable();
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw unavailable();
  }

  const value = {
    total: Math.min(Number(body.totalHits) || 0, MAX_RESULTS),
    results: (body.hits ?? []).map(toResult),
  };
  writeCache(cacheKey, value);
  return value;
};

// For tests
const clearCache = () => cache.clear();

module.exports = {
  QUERY_MAX_LENGTH,
  MIN_PER_PAGE,
  MAX_PER_PAGE,
  assertConfigured,
  searchImages,
  clearCache,
};
