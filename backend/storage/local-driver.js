const fs = require('node:fs/promises');
const path = require('node:path');

/**
 * Stores images on this server's disk, under MEDIA_DIR, and index.js serves them at
 * MEDIA_BASE_URL. For development and single-server deployments.
 * @param {object} config   From readMediaConfig
 */
const createLocalDriver = config => {
  const root = config.dir;

  // Keys come from content hashes, but check anyway that one can never point outside the root
  const resolveKey = key => {
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) {
      throw new Error(`Refusing to store outside the media folder: ${key}`);
    }
    return full;
  };

  return {
    name: 'local',
    root,

    async exists(key) {
      try {
        await fs.access(resolveKey(key));
        return true;
      } catch {
        return false;
      }
    },

    async put({ key, body }) {
      const full = resolveKey(key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      // Write to a temporary name first, so a crash mid-write never leaves a half-written file
      // under a name that claims to hold the complete image
      const temp = `${full}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temp, body);
      await fs.rename(temp, full);
    },

    publicUrl(key) {
      return `${config.baseUrl}/${key}`;
    },
  };
};

module.exports = createLocalDriver;
