const HttpError = require('../lib/http-error');
const { parseId } = require('../lib/ids');
const { hasPermission } = require('../lib/permissions');
const Collections = require('../models/collections');

/**
 * Middleware factory that loads the collection in req.params.collectionId and checks the
 * logged-in user's access to it. Goes after requireAuth. Sets req.collection on success.
 *
 * Responds 404 when the user has no access at all, the same as for a collection that does not
 * exist, so ids cannot be probed for private collections. Responds 403 when they can see the
 * collection but need a higher permission for this action.
 *
 * @param {'view'|'edit'|'own'} required    A Permission level
 */
const requireCollectionPermission = required => {
  hasPermission(null, required);

  return async (req, res, next) => {
    const id = parseId(req.params.collectionId);
    const collection = id && (await Collections.findCollectionForUser(req.pool, id, req.user.id));

    if (!collection?.permission) {
      throw new HttpError(404, 'Collection not found');
    }
    if (!hasPermission(collection.permission, required)) {
      throw new HttpError(403, `You need ${required} permission on this collection to do that`);
    }

    req.collection = collection;
    next();
  };
};

module.exports = requireCollectionPermission;
