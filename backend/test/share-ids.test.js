const {
  SHARE_ID_LENGTH,
  assertConfigured,
  encodeShareId,
  decodeShareId,
} = require('../lib/share-ids');

// Flips one character of a share id to another valid base64url character
const tamper = (shareId, index) => {
  const replacement = shareId[index] === 'A' ? 'B' : 'A';
  return shareId.slice(0, index) + replacement + shareId.slice(index + 1);
};

describe('Share ids', () => {
  test('Should be URL-safe and a fixed length', () => {
    expect(encodeShareId(1, 1)).toMatch(new RegExp(`^[A-Za-z0-9_-]{${SHARE_ID_LENGTH}}$`));
  });

  test.each([
    [1, 1],
    [42, 7],
    [2 ** 31 - 1, 2 ** 31 - 1],
  ])('Should decode (%i, %i) back to itself', (id, version) => {
    expect(decodeShareId(encodeShareId(id, version))).toEqual({ id, version });
  });

  test('Should always give the same id for the same collection and version', () => {
    expect(encodeShareId(5, 1)).toBe(encodeShareId(5, 1));
  });

  test('Should give every id and version a different share id', () => {
    const ids = new Set();
    for (let id = 1; id <= 200; id++) {
      for (let version = 1; version <= 5; version++) {
        ids.add(encodeShareId(id, version));
      }
    }
    expect(ids.size).toBe(1000);
  });

  test('Should not reveal the id or look like its neighbours', () => {
    const a = encodeShareId(1000, 1);
    const b = encodeShareId(1001, 1);
    const shared = [...a].filter((char, i) => char === b[i]).length;

    expect(a).not.toContain('1000');
    // Random 22-character strings share about one position by chance
    expect(shared).toBeLessThan(8);
  });

  test('Should reject every single-character change', () => {
    const shareId = encodeShareId(123, 4);
    for (let i = 0; i < shareId.length - 1; i++) {
      expect(decodeShareId(tamper(shareId, i))).toBeNull();
    }
  });

  test('Should reject the other spellings of the last character', () => {
    // The last character holds 2 unused bits, so up to 3 others decode to the same bytes
    const shareId = encodeShareId(123, 4);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const accepted = [...alphabet]
      .map(char => shareId.slice(0, -1) + char)
      .filter(candidate => decodeShareId(candidate) !== null);

    expect(accepted).toEqual([shareId]);
  });

  test.each([
    undefined,
    null,
    123,
    '',
    'short',
    'a'.repeat(SHARE_ID_LENGTH),
    'a'.repeat(SHARE_ID_LENGTH + 1),
    '!'.repeat(SHARE_ID_LENGTH),
  ])('Should reject %p', value => {
    expect(decodeShareId(value)).toBeNull();
  });

  test.each([
    [0, 1],
    [1, 0],
    [-1, 1],
    [1.5, 1],
    [2 ** 31, 1],
    ['1', 1],
  ])('Should refuse to encode (%p, %p)', (id, version) => {
    expect(() => encodeShareId(id, version)).toThrow(RangeError);
  });

  describe('with a different secret', () => {
    const original = process.env.SHARE_LINK_SECRET;
    afterEach(() => {
      process.env.SHARE_LINK_SECRET = original;
    });

    test('Should not accept share ids made with the old secret', () => {
      const shareId = encodeShareId(9, 1);
      process.env.SHARE_LINK_SECRET = 'a-completely-different-secret-of-32-bytes';

      expect(decodeShareId(shareId)).toBeNull();
      expect(encodeShareId(9, 1)).not.toBe(shareId);
    });

    test.each([undefined, '', 'too-short'])('Should refuse to start with secret %p', secret => {
      if (secret === undefined) {
        delete process.env.SHARE_LINK_SECRET;
      } else {
        process.env.SHARE_LINK_SECRET = secret;
      }

      expect(assertConfigured).toThrow(/SHARE_LINK_SECRET/);
    });
  });
});
