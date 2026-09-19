const crypto = require('node:crypto');
const { MAX_ID } = require('./ids');

/**
 * Share ids are the public ids in a collection's share link. Each one is derived from the
 * collection's id and share version, so nothing extra is stored, and no lookup table is needed:
 *
 *   block   = id (4 bytes) | version (4 bytes) | 8 zero bytes
 *   shareId = base64url(AES-256(key, block))            22 characters
 *
 * AES on a single block is a keyed permutation, so every (id, version) gets a different share id,
 * and without the key share ids look random: they do not reveal the id, cannot be guessed from
 * neighbouring collections, and cannot be forged. Decrypting a made-up share id almost never gives
 * back the 8 zero bytes (a 1 in 2^64 chance), which is how forgeries are rejected. Bumping the
 * version gives the collection a new share id and makes the old one stop resolving.
 */

const MIN_SECRET_BYTES = 32;
const BLOCK_BYTES = 16;
const SHARE_ID_LENGTH = 22;
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const MAX_VERSION = MAX_ID;

let cachedKey = null;

/**
 * The AES key, derived from SHARE_LINK_SECRET so the secret can be any string of 32+ bytes. A
 * separate secret from JWT_SECRET means rotating one does not break the other.
 */
const getKey = () => {
  const secret = process.env.SHARE_LINK_SECRET;
  if (!secret || Buffer.byteLength(secret) < MIN_SECRET_BYTES) {
    throw new Error(
      `SHARE_LINK_SECRET must be set to at least ${MIN_SECRET_BYTES} bytes. Generate one with: ` +
        `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
  if (cachedKey?.secret !== secret) {
    const key = crypto.hkdfSync('sha256', secret, '', 'collection-share-id', 32);
    cachedKey = { secret, key: Buffer.from(key) };
  }
  return cachedKey.key;
};

/**
 * Called at startup so a missing secret fails the boot instead of the first shared link
 */
const assertConfigured = () => {
  getKey();
};

const isInRange = (value, max) => Number.isInteger(value) && value > 0 && value <= max;

/**
 * @param {number} id           Collection id
 * @param {number} version      Collection share version
 * @returns {string}            The collection's share id
 */
const encodeShareId = (id, version) => {
  if (!isInRange(id, MAX_ID) || !isInRange(version, MAX_VERSION)) {
    throw new RangeError('Share ids need a positive integer id and version');
  }

  const block = Buffer.alloc(BLOCK_BYTES);
  block.writeUInt32BE(id, 0);
  block.writeUInt32BE(version, 4);

  const cipher = crypto.createCipheriv('aes-256-ecb', getKey(), null).setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]).toString('base64url');
};

/**
 * @param {*} shareId
 * @returns {{ id: number, version: number } | null}   What the share id was made from, or null if
 *          it was not made by encodeShareId with the current secret
 */
const decodeShareId = shareId => {
  if (typeof shareId !== 'string' || !SHARE_ID_PATTERN.test(shareId)) {
    return null;
  }

  const encrypted = Buffer.from(shareId, 'base64url');
  // The last character carries 2 unused bits; only accept the one spelling encodeShareId makes
  if (encrypted.length !== BLOCK_BYTES || encrypted.toString('base64url') !== shareId) {
    return null;
  }

  const decipher = crypto.createDecipheriv('aes-256-ecb', getKey(), null).setAutoPadding(false);
  const block = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  if (!block.subarray(8).equals(Buffer.alloc(BLOCK_BYTES - 8))) {
    return null;
  }

  const id = block.readUInt32BE(0);
  const version = block.readUInt32BE(4);
  if (!isInRange(id, MAX_ID) || !isInRange(version, MAX_VERSION)) {
    return null;
  }
  return { id, version };
};

module.exports = { SHARE_ID_LENGTH, assertConfigured, encodeShareId, decodeShareId };
