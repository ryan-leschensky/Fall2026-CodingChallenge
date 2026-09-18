const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// scrypt needs 128 * N * r bytes of memory
const maxmem = params => 256 * params.N * params.r;

/**
 * Hash a plaintext password with a random salt.
 * Format: scrypt$N$r$p$<salt base64>$<hash base64>
 */
const hashPassword = async password => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = await scrypt(password, salt, KEY_LENGTH, { ...COST, maxmem: maxmem(COST) });
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), hash.toString('base64')].join(
    '$',
  );
};

/**
 * Check a plaintext password against a stored hash in constant time.
 * @returns false (never throws) for a malformed stored hash.
 */
const verifyPassword = async (password, stored) => {
  const [algorithm, N, r, p, salt, hash] = String(stored).split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const params = { N: Number(N), r: Number(r), p: Number(p) };
  if (!Object.values(params).every(value => Number.isInteger(value) && value > 0)) {
    return false;
  }

  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    ...params,
    maxmem: maxmem(params),
  });
  return crypto.timingSafeEqual(actual, expected);
};

let dummyHash;
const getDummyHash = () => (dummyHash ??= hashPassword(crypto.randomBytes(32).toString('hex')));

module.exports = { hashPassword, verifyPassword, getDummyHash };
