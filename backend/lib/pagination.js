const HttpError = require('./http-error');
const { MAX_ID } = require('./ids');

// No list can hold more rows than there are ids, so larger offsets are rejected before they reach
// PostgreSQL, which would fail on values past its bigint range
const MAX_OFFSET = MAX_ID;

/**
 * Parses a positive integer (>= 1) from a query parameter.
 * @param {string|undefined} value
 * @param {string} name
 * @param {number|null} max
 * @returns {number|undefined}
 */
const parsePositiveInt = (value, name, max = null) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, `${name} must be a positive integer`);
  }
  const num = Number(value);
  if (max !== null && num > max) {
    throw new HttpError(400, `${name} must be at most ${max}`);
  }
  return num;
};

/**
 * Parses a non-negative integer (>= 0) from a query parameter.
 * @param {string|undefined} value
 * @param {string} name
 * @param {number|null} max
 * @returns {number|undefined}
 */
const parseNonNegativeInt = (value, name, max = null) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new HttpError(400, `${name} must be a non-negative integer`);
  }
  const num = Number(value);
  if (max !== null && num > max) {
    throw new HttpError(400, `${name} must be at most ${max}`);
  }
  return num;
};

/**
 * Reads pagination parameters (limit, page, offset) from request query. Every list is paginated:
 * with no parameters this is the first page of defaultLimit items, so no request can ask for an
 * unbounded list.
 * @param {object} query
 * @param {{ defaultLimit?: number, maxLimit?: number }} options
 * @returns {{ limit: number, offset: number }}
 */
const readPagination = (query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const limit = parsePositiveInt(query.limit, 'limit', maxLimit);
  const page = parsePositiveInt(query.page, 'page');
  const offset = parseNonNegativeInt(query.offset, 'offset', MAX_OFFSET);

  const effectiveLimit = limit ?? defaultLimit;
  const effectiveOffset = offset ?? (page !== undefined ? (page - 1) * effectiveLimit : 0);

  if (effectiveOffset > MAX_OFFSET) {
    throw new HttpError(400, 'page is too large');
  }

  return {
    limit: effectiveLimit,
    offset: effectiveOffset,
  };
};

module.exports = {
  MAX_OFFSET,
  parsePositiveInt,
  parseNonNegativeInt,
  readPagination,
};
