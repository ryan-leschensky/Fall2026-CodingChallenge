/**
 * Access levels on a collection, lowest to highest. Each level includes the ones below it:
 *  - view: see the collection and its images
 *  - edit: also rename it, and add, edit and remove images
 *  - own:  also share it, manage members, and delete it. A collection has exactly one owner.
 * Must match the collection_permission enum in seed/collections.sql.
 */
const Permission = Object.freeze({
  VIEW: 'view',
  EDIT: 'edit',
  OWN: 'own',
});

const RANK = Object.freeze({ [Permission.VIEW]: 1, [Permission.EDIT]: 2, [Permission.OWN]: 3 });

/**
 * @param {*} value
 * @returns {boolean}   Whether the value is one of the Permission levels
 */
const isPermission = value => typeof value === 'string' && Object.hasOwn(RANK, value);

/**
 * Whether an access level is enough for an action that needs another.
 * @param {string|null|undefined} actual    The user's level; none means no access
 * @param {string} required                 The level the action needs
 * @returns {boolean}
 */
const hasPermission = (actual, required) => {
  if (!isPermission(required)) {
    throw new TypeError(`Unknown permission "${required}"`);
  }
  return isPermission(actual) && RANK[actual] >= RANK[required];
};

module.exports = { Permission, isPermission, hasPermission };
