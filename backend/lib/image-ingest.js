const crypto = require('node:crypto');
const { imageSize } = require('image-size');
const HttpError = require('./http-error');
const { readMediaConfig } = require('./media-config');
const { getStorage } = require('../storage');

/**
 * Downloads images from allowed hosts and stores a copy, so collections keep working when the
 * original goes away. Pixabay requires this: its API terms forbid hotlinking their image URLs
 * long-term, and the full-size URLs it hands out expire after 24 hours.
 */

// The image formats that are kept, by the type image-size detects from the bytes
const FORMATS = {
  jpg: { extension: 'jpg', contentType: 'image/jpeg' },
  png: { extension: 'png', contentType: 'image/png' },
  webp: { extension: 'webp', contentType: 'image/webp' },
  gif: { extension: 'gif', contentType: 'image/gif' },
};

const MAX_REDIRECTS = 3;

/**
 * Whether a URL is on a host images are downloaded from (MEDIA_ALLOWED_HOSTS, subdomains
 * included). This allowlist is what stops the server being used to reach addresses it should not,
 * such as a cloud metadata service or something on the internal network.
 * @param {string} url
 * @returns {boolean}
 */
const isAllowedSource = url => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return (
    parsed.protocol === 'https:' &&
    readMediaConfig().allowedHosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`))
  );
};

// Drops a response body that will not be read, so its connection is freed. Not awaited: the
// request should not wait on the upstream server acknowledging it.
const discard = response => {
  response.body?.cancel().catch(() => {});
};

const downloadFailed = (url, reason) =>
  new HttpError(502, `Could not download the image from ${new URL(url).hostname}: ${reason}`, {
    expose: true,
  });

/**
 * Fetches a URL, following redirects one at a time so each one is checked against the allowlist.
 * Letting fetch follow them itself would let an allowed host redirect to an internal address.
 */
const fetchAllowed = async (url, timeoutMs) => {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedSource(current)) {
      throw new HttpError(400, `Images cannot be downloaded from ${new URL(current).hostname}`);
    }

    let response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: Object.values(FORMATS)
            .map(format => format.contentType)
            .join(', '),
        },
      });
    } catch (err) {
      throw downloadFailed(url, err.name === 'TimeoutError' ? 'it took too long' : 'no response');
    }

    if (response.status < 300 || response.status > 399) {
      return response;
    }
    const location = response.headers.get('location');
    discard(response);
    if (!location) {
      throw downloadFailed(url, `redirect ${response.status} with no location`);
    }
    current = new URL(location, current).href;
  }
  throw downloadFailed(url, 'too many redirects');
};

/**
 * Reads a response body, stopping as soon as it goes over maxBytes. Content-Length is only a
 * hint that a server can get wrong, so the running total is what enforces the limit.
 */
const readLimited = async (response, maxBytes) => {
  const tooLarge = () => {
    const limit =
      maxBytes >= 1024 * 1024
        ? `${+(maxBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${maxBytes} bytes`;
    return new HttpError(413, `The image is larger than the ${limit} limit`);
  };

  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) {
    discard(response);
    throw tooLarge();
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) {
      throw tooLarge();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
};

/**
 * Downloads an image from an allowed host and stores it. The file is named after a hash of its
 * bytes, so the same image saved to many collections is stored once.
 * @param {string} url      An https URL on an allowed host
 * @returns {Promise<{ url: string, width: number, height: number, contentType: string,
 *          bytes: number }>}  Where the copy is served from, and what it is
 * @throws {HttpError} 400 for a host that is not allowed, 413 when too large, 415 when it is not
 *         a supported image, 502 when it could not be downloaded
 */
const ingestImage = async url => {
  const { maxBytes, fetchTimeoutMs } = readMediaConfig();
  const response = await fetchAllowed(url, fetchTimeoutMs);
  if (!response.ok) {
    discard(response);
    throw downloadFailed(url, `the server answered ${response.status}`);
  }

  const body = await readLimited(response, maxBytes);

  // Trust the bytes, not the Content-Type header: this proves the file is an image, and gives
  // its real format and size
  let detected;
  try {
    detected = imageSize(new Uint8Array(body.buffer, body.byteOffset, body.length));
  } catch {
    detected = null;
  }
  const format = detected && FORMATS[detected.type];
  if (!format) {
    throw new HttpError(415, 'That is not a JPEG, PNG, WebP or GIF image');
  }

  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const key = `images/${hash.slice(0, 2)}/${hash}.${format.extension}`;

  const storage = getStorage();
  if (!(await storage.exists(key))) {
    await storage.put({ key, body, contentType: format.contentType });
  }

  return {
    url: storage.publicUrl(key),
    width: detected.width,
    height: detected.height,
    contentType: format.contentType,
    bytes: body.length,
  };
};

module.exports = { isAllowedSource, ingestImage };
