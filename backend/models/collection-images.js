/**
 * Database access for the images saved in collections. Every function that changes an image also
 * bumps its collection's updated_at in the same statement, so recently changed collections sort
 * first.
 */

const URL_MAX_LENGTH = 2048;
const SOURCE_PATTERN = /^[a-z0-9_-]{1,30}$/;
const SOURCE_ID_MAX_LENGTH = 100;
const TITLE_MAX_LENGTH = 200;
const NOTE_MAX_LENGTH = 2000;
const TAG_MAX_LENGTH = 50;
const MAX_TAGS = 20;

const UNIQUE_VIOLATION = '23505';

const IMAGE_COLUMNS = `id, collection_id AS "collectionId", added_by AS "addedBy",
  source, source_id AS "sourceId", image_url AS "imageUrl", thumbnail_url AS "thumbnailUrl",
  page_url AS "pageUrl", width, height, title, note, tags,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

// Runs alongside a change to an image; $1 must be the collection id
const TOUCH_COLLECTION = 'UPDATE collections SET updated_at = now() WHERE id = $1';

/**
 * Error thrown when an image is already saved in a collection.
 */
class DuplicateImageError extends Error {
  constructor() {
    super('This image is already in the collection');
    this.name = 'DuplicateImageError';
  }
}

/**
 * Lists a collection's images, newest first.
 * @param db                        Database connection
 * @param {number} collectionId     Collection ID
 * @param {{ limit?: number, offset?: number }} [options] Pagination options
 * @returns {Promise<object[]>}
 */
const listImages = async (db, collectionId, options = {}) => {
  const { limit, offset } = options;
  let sql = `SELECT ${IMAGE_COLUMNS} FROM collection_images
     WHERE collection_id = $1
     ORDER BY created_at DESC, id DESC`;
  const params = [collectionId];
  if (typeof limit === 'number' && limit > 0) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
    if (typeof offset === 'number' && offset >= 0) {
      params.push(offset);
      sql += ` OFFSET $${params.length}`;
    }
  }
  const { rows } = await db.query(sql, params);
  return rows;
};

/**
 * Counts the total number of images in a collection.
 * @param db                        Database connection
 * @param {number} collectionId     Collection ID
 * @returns {Promise<number>}
 */
const countImages = async (db, collectionId) => {
  const { rows } = await db.query(
    'SELECT count(*)::integer AS total FROM collection_images WHERE collection_id = $1',
    [collectionId],
  );
  return rows[0].total;
};

/**
 * Finds one image in a collection.
 * @param db                        Database connection
 * @param {number} collectionId     Collection ID
 * @param {number} imageId          Image ID
 * @returns {Promise<object|null>}  The image, or null if the collection has no such image
 */
const findImage = async (db, collectionId, imageId) => {
  const { rows } = await db.query(
    `SELECT ${IMAGE_COLUMNS} FROM collection_images WHERE collection_id = $1 AND id = $2`,
    [collectionId, imageId],
  );
  return rows[0] ?? null;
};

/**
 * Saves an image to a collection.
 * @param db                        Database connection
 * @param {number} collectionId     Collection ID
 * @param {number} userId           User ID of whoever saved it
 * @param {object} image            imageUrl is required; everything else is optional
 * @returns {Promise<object>}       The saved image
 * @throws {DuplicateImageError}    If the collection already has an image with that imageUrl
 */
const addImage = async (db, collectionId, userId, image) => {
  try {
    const { rows } = await db.query(
      `WITH added AS (
         INSERT INTO collection_images (collection_id, added_by, source, source_id, image_url,
                                        thumbnail_url, page_url, width, height, title, note, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *
       ), touched AS (${TOUCH_COLLECTION})
       SELECT ${IMAGE_COLUMNS} FROM added`,
      [
        collectionId,
        userId,
        image.source ?? 'url',
        image.sourceId ?? null,
        image.imageUrl,
        image.thumbnailUrl ?? null,
        image.pageUrl ?? null,
        image.width ?? null,
        image.height ?? null,
        image.title ?? '',
        image.note ?? '',
        image.tags ?? [],
      ],
    );
    return rows[0];
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new DuplicateImageError();
    }
    throw err;
  }
};

/**
 * Changes an image's title, note or tags. Fields left undefined are unchanged.
 * @param db                        Database connection
 * @param {number} collectionId     Collection ID
 * @param {number} imageId          Image ID
 * @param {{ title?: string, note?: string, tags?: string[] }} changes
 * @returns {Promise<object|null>}  The updated image, or null if the collection has no such image
 */
const updateImage = async (db, collectionId, imageId, { title, note, tags }) => {
  const { rows } = await db.query(
    `WITH updated AS (
       UPDATE collection_images
       SET title = COALESCE($3, title), note = COALESCE($4, note), tags = COALESCE($5, tags),
           updated_at = now()
       WHERE collection_id = $1 AND id = $2
       RETURNING *
     ), touched AS (${TOUCH_COLLECTION} AND EXISTS (SELECT 1 FROM updated))
     SELECT ${IMAGE_COLUMNS} FROM updated`,
    [collectionId, imageId, title ?? null, note ?? null, tags ?? null],
  );
  return rows[0] ?? null;
};

/**
 * Removes an image from a collection.
 * @param db                        Database connection
 * @param {number} collectionId     Collection ID
 * @param {number} imageId          Image ID
 * @returns {Promise<boolean>}      Whether the collection had that image
 */
const deleteImage = async (db, collectionId, imageId) => {
  const { rows } = await db.query(
    `WITH deleted AS (
       DELETE FROM collection_images WHERE collection_id = $1 AND id = $2 RETURNING id
     ), touched AS (${TOUCH_COLLECTION} AND EXISTS (SELECT 1 FROM deleted))
     SELECT count(*)::integer AS deleted FROM deleted`,
    [collectionId, imageId],
  );
  return rows[0].deleted > 0;
};

module.exports = {
  URL_MAX_LENGTH,
  SOURCE_PATTERN,
  SOURCE_ID_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  MAX_TAGS,
  DuplicateImageError,
  listImages,
  countImages,
  findImage,
  addImage,
  updateImage,
  deleteImage,
};
