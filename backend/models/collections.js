/**
 * Database access for collections. Like the other models, every function takes the pg pool
 * (req.pool) as its first argument.
 *
 * Collections are always read on behalf of a user (or null for someone not logged in), so each one
 * comes back with that user's access level in `permission`.
 */

const { Permission } = require('../lib/permissions');
const { encodeShareId } = require('../lib/share-ids');

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;

/**
 * A collection as seen by one user.
 */
class Collection {
  /**
   * @param {object} row  A row from SELECT_COLLECTION
   */
  constructor(row) {
    this.id = row.id;
    this.name = row.name;
    this.description = row.description;
    this.owner = row.owner;
    /** @type {'view'|'edit'|'own'|null} The user's access; null if they are not a member */
    this.permission = row.permission;
    /** @type {'view'|'edit'|null} What joining through the share link grants; null if off */
    this.linkAccess = row.linkAccess;
    this.shareVersion = row.shareVersion;
    this.imageCount = row.imageCount;
    this.coverUrl = row.coverUrl;
    this.createdAt = row.createdAt;
    this.updatedAt = row.updatedAt;
  }

  /**
   * The public id used in the collection's share link, derived from its id and share version
   * (see lib/share-ids.js). Changes when the owner resets the link.
   * @returns {string}
   */
  get shareId() {
    return encodeShareId(this.id, this.shareVersion);
  }

  /**
   * The share id is only sent to the owner, and to anyone else only while link sharing is on.
   * Otherwise a member removed from a collection could keep a link that works again later.
   */
  toJSON() {
    const { shareVersion, ...fields } = this;
    const canSeeLink = this.permission === Permission.OWN || this.linkAccess !== null;
    return { ...fields, shareId: canSeeLink ? this.shareId : null };
  }
}

// $1 is the id of the user reading the collections, or null
const SELECT_COLLECTION = `
  SELECT c.id, c.name, c.description,
         json_build_object('id', o.id, 'username', o.username) AS owner,
         CASE WHEN c.owner_id = $1 THEN 'own'::collection_permission ELSE m.permission END
           AS permission,
         c.link_access AS "linkAccess", c.share_version AS "shareVersion",
         stats.image_count AS "imageCount", stats.cover_url AS "coverUrl",
         c.created_at AS "createdAt", c.updated_at AS "updatedAt"
  FROM collections c
  JOIN users o ON o.id = c.owner_id
  LEFT JOIN collection_members m ON m.collection_id = c.id AND m.user_id = $1
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS image_count,
           (array_agg(COALESCE(i.thumbnail_url, i.image_url)
                      ORDER BY i.created_at DESC, i.id DESC))[1] AS cover_url
    FROM collection_images i
    WHERE i.collection_id = c.id
  ) stats`;

/**
 * Lists the collections a user owns or is a member of, most recently changed first.
 * @param db                        Database connection
 * @param {number} userId           User ID
 * @returns {Promise<Collection[]>}
 */
const listCollectionsForUser = async (db, userId) => {
  const { rows } = await db.query(
    `${SELECT_COLLECTION}
     WHERE c.owner_id = $1 OR m.user_id IS NOT NULL
     ORDER BY c.updated_at DESC, c.id DESC`,
    [userId],
  );
  return rows.map(row => new Collection(row));
};

/**
 * Finds a collection by id, with the user's access to it.
 * @param db                            Database connection
 * @param {number} id                   Collection ID
 * @param {number|null} userId          User ID, or null for someone not logged in
 * @returns {Promise<Collection|null>}  The collection, or null if there is none with that id
 */
const findCollectionForUser = async (db, id, userId) => {
  const { rows } = await db.query(`${SELECT_COLLECTION} WHERE c.id = $2`, [userId, id]);
  return rows[0] ? new Collection(rows[0]) : null;
};

/**
 * Finds a collection through its share link.
 * @param db                            Database connection
 * @param {{ id: number, version: number }} share   A decoded share id
 * @param {number|null} userId          User ID, or null for someone not logged in
 * @returns {Promise<Collection|null>}  The collection, or null if the link has been reset or
 *                                      link sharing is off
 */
const findCollectionByShare = async (db, { id, version }, userId) => {
  const { rows } = await db.query(
    `${SELECT_COLLECTION}
     WHERE c.id = $2 AND c.share_version = $3 AND c.link_access IS NOT NULL`,
    [userId, id, version],
  );
  return rows[0] ? new Collection(rows[0]) : null;
};

/**
 * Creates a collection owned by a user.
 * @param db                            Database connection
 * @param {object} param1
 * @param {number} param1.ownerId       User ID of the owner
 * @param {string} param1.name          Name
 * @param {string} [param1.description] Description
 * @returns {Promise<Collection>}       The new collection, as seen by its owner
 */
const createCollection = async (db, { ownerId, name, description = '' }) => {
  const { rows } = await db.query(
    'INSERT INTO collections (owner_id, name, description) VALUES ($1, $2, $3) RETURNING id',
    [ownerId, name, description],
  );
  return findCollectionForUser(db, rows[0].id, ownerId);
};

/**
 * Renames a collection or changes its description. Fields left undefined are unchanged.
 * @param db                            Database connection
 * @param {number} id                   Collection ID
 * @param {{ name?: string, description?: string }} changes
 * @returns {Promise<boolean>}          Whether the collection exists
 */
const updateCollection = async (db, id, { name, description }) => {
  const { rowCount } = await db.query(
    `UPDATE collections
     SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = now()
     WHERE id = $1`,
    [id, name ?? null, description ?? null],
  );
  return rowCount > 0;
};

/**
 * Deletes a collection along with its images and members.
 * @param db                        Database connection
 * @param {number} id               Collection ID
 * @returns {Promise<boolean>}      Whether the collection existed
 */
const deleteCollection = async (db, id) => {
  const { rowCount } = await db.query('DELETE FROM collections WHERE id = $1', [id]);
  return rowCount > 0;
};

/**
 * Turns link sharing on at an access level, or off.
 * @param db                        Database connection
 * @param {number} id               Collection ID
 * @param {'view'|'edit'|null} linkAccess   What joining through the link grants; null for off
 * @returns {Promise<boolean>}      Whether the collection exists
 */
const setLinkAccess = async (db, id, linkAccess) => {
  const { rowCount } = await db.query(
    'UPDATE collections SET link_access = $2, updated_at = now() WHERE id = $1',
    [id, linkAccess],
  );
  return rowCount > 0;
};

/**
 * Gives a collection a new share id, so links shared before stop working. Members who already
 * joined through an old link keep their access.
 * @param db                        Database connection
 * @param {number} id               Collection ID
 * @returns {Promise<boolean>}      Whether the collection exists
 */
const resetShareLink = async (db, id) => {
  const { rowCount } = await db.query(
    'UPDATE collections SET share_version = share_version + 1, updated_at = now() WHERE id = $1',
    [id],
  );
  return rowCount > 0;
};

module.exports = {
  NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  Collection,
  listCollectionsForUser,
  findCollectionForUser,
  findCollectionByShare,
  createCollection,
  updateCollection,
  deleteCollection,
  setLinkAccess,
  resetShareLink,
};
