const express = require('express');
const HttpError = require('../lib/http-error');
const { decodeShareId } = require('../lib/share-ids');
const optionalAuth = require('../middleware/optional-auth');
const requireAuth = require('../middleware/require-auth');
const Collections = require('../models/collections');
const CollectionImages = require('../models/collection-images');
const CollectionMembers = require('../models/collection-members');

// Collections opened through their share link: /api/shared/:shareId
const router = express.Router();

/**
 * Finds the collection a share link points to, as seen by the requesting user (if any).
 * @throws {HttpError} 404 if the share id is malformed, was reset, or link sharing is off
 */
const findSharedCollection = async req => {
  const share = decodeShareId(req.params.shareId);
  const collection =
    share && (await Collections.findCollectionByShare(req.pool, share, req.user?.id ?? null));
  if (!collection) {
    throw new HttpError(404, 'This share link is invalid or no longer active');
  }
  return collection;
};

/**
 * @openapi
 * components:
 *   parameters:
 *     ShareId:
 *       in: path
 *       name: shareId
 *       required: true
 *       schema:
 *         type: string
 *         pattern: '^[A-Za-z0-9_-]{22}$'
 *       description: The shareId of a collection
 */

/**
 * @openapi
 * /api/shared/{shareId}:
 *   get:
 *     summary: View a collection through its share link
 *     description: >
 *       Works without logging in. With an access token, permission is the user's own access to
 *       the collection (null until they join).
 *     tags:
 *       - Sharing
 *     security:
 *       - {}
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ShareId'
 *     responses:
 *       200:
 *         description: The collection and its images
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollectionWithImages'
 *       401:
 *         description: An access token was sent but is invalid or expired
 *       404:
 *         description: The link is invalid, was reset, or link sharing is off
 */
router.get('/:shareId', optionalAuth, async (req, res) => {
  const collection = await findSharedCollection(req);
  const images = await CollectionImages.listImages(req.pool, collection.id);

  // The response depends on who is asking and can stop being public at any time
  res.set('Cache-Control', 'no-store');
  res.json({ ...collection.toJSON(), images });
});

/**
 * @openapi
 * /api/shared/{shareId}/join:
 *   post:
 *     summary: Join a collection through its share link
 *     description: >
 *       Adds the user as a member with the access the link grants, so the collection shows up in
 *       their list. A member who already has more access keeps it. Joining again is harmless.
 *     tags:
 *       - Sharing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ShareId'
 *     responses:
 *       200:
 *         description: The collection, with the user's permission
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Collection'
 *       401:
 *         description: Missing, invalid, or expired access token
 *       404:
 *         description: The link is invalid, was reset, or link sharing is off
 */
router.post('/:shareId/join', requireAuth, async (req, res) => {
  const collection = await findSharedCollection(req);

  await CollectionMembers.joinThroughLink(req.pool, {
    collectionId: collection.id,
    userId: req.user.id,
    permission: collection.linkAccess,
  });
  res.json(await Collections.findCollectionForUser(req.pool, collection.id, req.user.id));
});

module.exports = router;
