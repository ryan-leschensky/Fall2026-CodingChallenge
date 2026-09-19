const HttpError = require('../lib/http-error');
const {
  MAX_OFFSET,
  parsePositiveInt,
  parseNonNegativeInt,
  readPagination,
} = require('../lib/pagination');

describe('parsePositiveInt', () => {
  test('returns undefined when value is undefined', () => {
    expect(parsePositiveInt(undefined, 'limit')).toBeUndefined();
  });

  test.each([null, 1, 0, -1, true, false, {}, [], () => {}])(
    'throws HttpError 400 when value is not a string (%p)',
    value => {
      expect(() => parsePositiveInt(value, 'limit')).toThrow(HttpError);
      try {
        parsePositiveInt(value, 'limit');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toBe('limit must be a positive integer');
      }
    },
  );

  test.each(['', '0', '-1', '-10', 'abc', '1a', 'a1', '1.5', '1e3', ' 1', '1 ', '01', '007', '+1'])(
    'throws HttpError 400 for invalid string format %j',
    value => {
      expect(() => parsePositiveInt(value, 'page')).toThrow(HttpError);
      try {
        parsePositiveInt(value, 'page');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toBe('page must be a positive integer');
      }
    },
  );

  test.each([
    ['1', 1],
    ['2', 2],
    ['10', 10],
    ['100', 100],
    ['9999', 9999],
  ])('parses valid positive integer string %j to %i without max', (value, expected) => {
    expect(parsePositiveInt(value, 'limit')).toBe(expected);
    expect(parsePositiveInt(value, 'limit', null)).toBe(expected);
  });

  test('validates value against max when max is provided', () => {
    expect(parsePositiveInt('50', 'limit', 100)).toBe(50);
    expect(parsePositiveInt('100', 'limit', 100)).toBe(100);

    expect(() => parsePositiveInt('101', 'limit', 100)).toThrow(HttpError);
    try {
      parsePositiveInt('101', 'limit', 100);
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toBe('limit must be at most 100');
    }
  });
});

describe('parseNonNegativeInt', () => {
  test('returns undefined when value is undefined', () => {
    expect(parseNonNegativeInt(undefined, 'offset')).toBeUndefined();
  });

  test.each([null, 0, 1, -1, true, false, {}, [], () => {}])(
    'throws HttpError 400 when value is not a string (%p)',
    value => {
      expect(() => parseNonNegativeInt(value, 'offset')).toThrow(HttpError);
      try {
        parseNonNegativeInt(value, 'offset');
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toBe('offset must be a non-negative integer');
      }
    },
  );

  test.each([
    '',
    '-0',
    '-1',
    '-10',
    'abc',
    '0a',
    'a0',
    '0.5',
    '1.5',
    ' 0',
    '0 ',
    '00',
    '01',
    '+0',
    '+1',
  ])('throws HttpError 400 for invalid string format %j', value => {
    expect(() => parseNonNegativeInt(value, 'offset')).toThrow(HttpError);
    try {
      parseNonNegativeInt(value, 'offset');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toBe('offset must be a non-negative integer');
    }
  });

  test.each([
    ['0', 0],
    ['1', 1],
    ['2', 2],
    ['10', 10],
    ['100', 100],
    ['9999', 9999],
  ])('parses valid non-negative integer string %j to %i', (value, expected) => {
    expect(parseNonNegativeInt(value, 'offset')).toBe(expected);
  });

  test('validates value against max when max is provided', () => {
    expect(parseNonNegativeInt('100', 'offset', 100)).toBe(100);

    expect(() => parseNonNegativeInt('101', 'offset', 100)).toThrow(HttpError);
    try {
      parseNonNegativeInt('101', 'offset', 100);
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toBe('offset must be at most 100');
    }
  });
});

describe('readPagination', () => {
  test('returns the first page at the default limit when nothing is specified', () => {
    expect(readPagination()).toEqual({ limit: 20, offset: 0 });
    expect(readPagination({})).toEqual({ limit: 20, offset: 0 });
    expect(readPagination({}, { defaultLimit: 50 })).toEqual({ limit: 50, offset: 0 });
  });

  test('accepts the largest offset PostgreSQL can hold', () => {
    expect(readPagination({ offset: String(MAX_OFFSET) })).toEqual({
      limit: 20,
      offset: MAX_OFFSET,
    });
  });

  test.each([
    { offset: String(MAX_OFFSET + 1) },
    { offset: '99999999999999999999' },
    { page: '99999999999999999' },
    { page: '99999999999999999', limit: '100' },
    { page: String(Math.floor(MAX_OFFSET / 20) + 2) },
  ])('throws HttpError 400 instead of passing an out-of-range offset on %j', query => {
    expect(() => readPagination(query)).toThrow(HttpError);
    try {
      readPagination(query);
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  test('returns pagination when limit is specified', () => {
    expect(readPagination({ limit: '10' })).toEqual({
      limit: 10,
      offset: 0,
    });
  });

  test('returns pagination when page is specified', () => {
    expect(readPagination({ page: '1' })).toEqual({
      limit: 20,
      offset: 0,
    });
    expect(readPagination({ page: '3' })).toEqual({
      limit: 20,
      offset: 40,
    });
  });

  test('returns pagination when offset is specified', () => {
    expect(readPagination({ offset: '0' })).toEqual({
      limit: 20,
      offset: 0,
    });
    expect(readPagination({ offset: '15' })).toEqual({
      limit: 20,
      offset: 15,
    });
  });

  test('returns pagination when both limit and page are specified', () => {
    expect(readPagination({ limit: '10', page: '3' })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  test('returns pagination when both limit and offset are specified', () => {
    expect(readPagination({ limit: '10', offset: '35' })).toEqual({
      limit: 10,
      offset: 35,
    });
  });

  test('offset takes precedence over page when both are specified', () => {
    expect(readPagination({ limit: '10', page: '3', offset: '50' })).toEqual({
      limit: 10,
      offset: 50,
    });
    expect(readPagination({ page: '3', offset: '0' })).toEqual({
      limit: 20,
      offset: 0,
    });
  });

  test('respects custom defaultLimit and maxLimit options', () => {
    expect(readPagination({ page: '2' }, { defaultLimit: 50 })).toEqual({
      limit: 50,
      offset: 50,
    });

    expect(readPagination({ limit: '150' }, { maxLimit: 200 })).toEqual({
      limit: 150,
      offset: 0,
    });

    expect(() => readPagination({ limit: '150' }, { maxLimit: 100 })).toThrow(HttpError);
  });

  test('throws HttpError 400 when invalid limit is provided', () => {
    expect(() => readPagination({ limit: '0' })).toThrow(HttpError);
    expect(() => readPagination({ limit: '101' })).toThrow(HttpError);
    expect(() => readPagination({ limit: 'invalid' })).toThrow(HttpError);
  });

  test('throws HttpError 400 when invalid page is provided', () => {
    expect(() => readPagination({ page: '0' })).toThrow(HttpError);
    expect(() => readPagination({ page: '-1' })).toThrow(HttpError);
    expect(() => readPagination({ page: 'invalid' })).toThrow(HttpError);
  });

  test('throws HttpError 400 when invalid offset is provided', () => {
    expect(() => readPagination({ offset: '-1' })).toThrow(HttpError);
    expect(() => readPagination({ offset: 'invalid' })).toThrow(HttpError);
  });
});
