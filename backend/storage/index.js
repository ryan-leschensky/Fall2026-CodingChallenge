const { readMediaConfig } = require('../lib/media-config');
const createLocalDriver = require('./local-driver');
const createS3Driver = require('./s3-driver');

/**
 * Where saved images are stored, chosen by STORAGE_DRIVER. Every driver has the same operations:
 *   exists(key)                      -> Promise<boolean>
 *   put({ key, body, contentType })  -> Promise<void>
 *   publicUrl(key)                   -> string
 *
 * There is deliberately no delete. Keys are hashes of the file, so one stored file is shared by
 * every collection that saved the same image; removing it safely would need a sweep that checks
 * nothing still uses it.
 */

const DRIVERS = { local: createLocalDriver, s3: createS3Driver };

let storage = null;

/**
 * @returns {object} The configured storage driver, created on first use
 */
const getStorage = () => {
  if (!storage) {
    const config = readMediaConfig();
    storage = DRIVERS[config.driver](config);
  }
  return storage;
};

/**
 * Called at startup so a bad storage setting fails the boot instead of the first saved image
 */
const assertConfigured = () => {
  getStorage();
};

module.exports = { getStorage, assertConfigured };
