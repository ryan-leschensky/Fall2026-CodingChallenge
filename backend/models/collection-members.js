/**
 * Database access for the users a collection is shared with. The owner is not a member row (see
 * seed/collections.sql), but is included when listing members so clients get everyone in one list.
 */

const { Permission } = require('../lib/permissions');

const MEMBER_COLUMNS = 'u.id, u.username, m.permission, m.added_at AS "addedAt"';

/**
 * Lists everyone with access to a collection: the owner first, then editors, then viewers.
 * @param db                        Database connection
 * @param {number} collectionId     Collection ID
 * @returns {Promise<object[]>}     Users with their permission and when they were added
 */
const listMembers = async (db, collectionId) => {
  const { rows } = await db.query(
    `SELECT u.id, u.username, 'own'::collection_permission AS permission,
            c.created_at AS "addedAt"
     FROM collections c JOIN users u ON u.id = c.owner_id
     WHERE c.id = $1
     UNION ALL
     SELECT ${MEMBER_COLUMNS}
     FROM collection_members m JOIN users u ON u.id = m.user_id
     WHERE m.collection_id = $1
     ORDER BY permission DESC, "addedAt", username`,
    [collectionId],
  );
  return rows;
};

/**
 * Adds a member, or changes the permission of an existing one. Does nothing for the owner, whose
 * access is set by ownership.
 * @param db                            Database connection
 * @param {object} param1
 * @param {number} param1.collectionId  Collection ID
 * @param {number} param1.userId        User ID
 * @param {'view'|'edit'} param1.permission
 * @returns {Promise<{ member: object, created: boolean } | null>}  The member and whether they
 *          were newly added, or null if the user owns the collection
 */
const setMember = async (db, { collectionId, userId, permission }) => {
  const { rows } = await db.query(
    `WITH saved AS (
       INSERT INTO collection_members (collection_id, user_id, permission)
       SELECT $1::integer, $2::integer, $3::collection_permission
       WHERE NOT EXISTS (SELECT 1 FROM collections WHERE id = $1 AND owner_id = $2)
       ON CONFLICT (collection_id, user_id) DO UPDATE SET permission = EXCLUDED.permission
       RETURNING user_id, permission, added_at, xmax = 0 AS created
     )
     SELECT ${MEMBER_COLUMNS}, m.created
     FROM saved m JOIN users u ON u.id = m.user_id`,
    [collectionId, userId, permission],
  );
  if (!rows[0]) {
    return null;
  }
  const { created, ...member } = rows[0];
  return { member, created };
};

/**
 * Adds a user who opened the share link as a member, at the access level the link grants. A
 * member who already has more access keeps it, and the owner is left as they are.
 * @param db                            Database connection
 * @param {object} param1
 * @param {number} param1.collectionId  Collection ID
 * @param {number} param1.userId        User ID
 * @param {'view'|'edit'} param1.permission     The collection's link access
 * @returns {Promise<void>}
 */
const joinThroughLink = async (db, { collectionId, userId, permission }) => {
  // The enum is ordered, so GREATEST keeps the higher of the two permissions
  await db.query(
    `INSERT INTO collection_members (collection_id, user_id, permission)
     SELECT $1::integer, $2::integer, $3::collection_permission
     WHERE NOT EXISTS (SELECT 1 FROM collections WHERE id = $1 AND owner_id = $2)
     ON CONFLICT (collection_id, user_id)
     DO UPDATE SET permission = GREATEST(collection_members.permission, EXCLUDED.permission)`,
    [collectionId, userId, permission],
  );
};

/**
 * Removes a member's access.
 * @param db                        Database connection
 * @param {number} collectionId     Collection ID
 * @param {number} userId           User ID
 * @returns {Promise<boolean>}      Whether they were a member
 */
const removeMember = async (db, collectionId, userId) => {
  const { rowCount } = await db.query(
    'DELETE FROM collection_members WHERE collection_id = $1 AND user_id = $2',
    [collectionId, userId],
  );
  return rowCount > 0;
};

/**
 * Makes a member the owner of a collection. The previous owner stays on as an editor. This is
 * one statement, so it either happens completely or not at all, and it only matches while
 * fromUserId still owns the collection, so two transfers at once cannot both go through.
 * @param db                            Database connection
 * @param {object} param1
 * @param {number} param1.collectionId  Collection ID
 * @param {number} param1.fromUserId    User ID of the current owner
 * @param {number} param1.toUserId      User ID of the new owner, who must already be a member
 * @returns {Promise<boolean>}          Whether ownership changed
 */
const transferOwnership = async (db, { collectionId, fromUserId, toUserId }) => {
  const { rows } = await db.query(
    `WITH transferred AS (
       UPDATE collections SET owner_id = $3, updated_at = now()
       WHERE id = $1 AND owner_id = $2
         AND EXISTS (SELECT 1 FROM collection_members WHERE collection_id = $1 AND user_id = $3)
       RETURNING id
     ), promoted AS (
       DELETE FROM collection_members
       WHERE collection_id IN (SELECT id FROM transferred) AND user_id = $3
     ), demoted AS (
       INSERT INTO collection_members (collection_id, user_id, permission)
       SELECT id, $2::integer, $4::collection_permission FROM transferred
     )
     SELECT count(*)::integer AS transferred FROM transferred`,
    [collectionId, fromUserId, toUserId, Permission.EDIT],
  );
  return rows[0].transferred > 0;
};

module.exports = { listMembers, setMember, joinThroughLink, removeMember, transferOwnership };
