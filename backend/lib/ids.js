// Largest value of a PostgreSQL INTEGER, the type of every id column
const MAX_ID = 2 ** 31 - 1;

/**
 * Parse a database id from a URL parameter.
 * @param {string} value
 * @returns {number|null}   The id, or null if the value is not a positive integer in range
 */
const parseId = value => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return id <= MAX_ID ? id : null;
};

module.exports = { MAX_ID, parseId };
