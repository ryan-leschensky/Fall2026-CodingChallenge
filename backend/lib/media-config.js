const path = require('node:path');

/**
 * Settings for storing saved images, read from the environment. Every setting has a default that
 * works for local development; see .env.example.
 */

const DRIVERS = ['local', 's3'];
const S3_REQUIRED = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'];

const list = value =>
  value
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);

const positiveInteger = (name, fallback, problems) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    problems.push(`${name} must be a positive integer`);
  }
  return value;
};

/**
 * @returns {object} The media settings
 * @throws {Error} Listing every setting that is missing or invalid
 */
const readMediaConfig = () => {
  const env = process.env;
  const problems = [];

  const driver = env.STORAGE_DRIVER || 'local';
  if (!DRIVERS.includes(driver)) {
    problems.push(`STORAGE_DRIVER must be one of: ${DRIVERS.join(', ')}`);
  }
  if (driver === 's3') {
    for (const name of S3_REQUIRED.filter(name => !env[name])) {
      problems.push(`${name} is required when STORAGE_DRIVER=s3`);
    }
  }

  const config = {
    driver,
    // Relative paths are relative to the backend folder, not wherever the server was started from
    dir: path.resolve(__dirname, '..', env.MEDIA_DIR || 'media'),
    baseUrl: (env.MEDIA_BASE_URL || `http://localhost:${env.PORT || 3000}/media`).replace(
      /\/$/,
      '',
    ),
    maxBytes: positiveInteger('MEDIA_MAX_BYTES', 10 * 1024 * 1024, problems),
    fetchTimeoutMs: positiveInteger('MEDIA_FETCH_TIMEOUT_MS', 10_000, problems),
    allowedHosts: list(env.MEDIA_ALLOWED_HOSTS ?? 'pixabay.com'),
    s3: {
      bucket: env.S3_BUCKET,
      region: env.S3_REGION || 'auto',
      endpoint: env.S3_ENDPOINT || undefined,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
      publicBaseUrl: env.S3_PUBLIC_BASE_URL?.replace(/\/$/, ''),
    },
  };

  if (problems.length > 0) {
    throw new Error(`Invalid media settings:\n  ${problems.join('\n  ')}`);
  }
  return config;
};

module.exports = { readMediaConfig };
