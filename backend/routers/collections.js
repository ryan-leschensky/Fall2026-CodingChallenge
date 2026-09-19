const express = require('express');
const HttpError = require('../lib/http-error');
const { readPagination } = require('../lib/pagination');
const { Permission } = require('../lib/permissions');
const requireAuth = require('../middleware/require-auth');
const requireCollectionPermission = require('../middleware/collection-access');
const Collections = require('../models/collections');
const CollectionImages = require('../models/collection-images');
const members = require('./collection-members');
const images = require('./collection-images');

const router = express.Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     Permission:
 *       type: string
 *       enum: [view, edit, own]
 *       description: >
 *         Access to a collection. Each level includes the ones before it. view sees the collection;
 *         edit also renames it and adds, edits and removes images; own also shares it, manages
 *         members, and deletes it.
 *     UserSummary:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         username:
 *           type: string
 *     Collection:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         owner:
 *           $ref: '#/components/schemas/UserSummary'
 *         permission:
 *           allOf:
 *             - $ref: '#/components/schemas/Permission'
 *           nullable: true
 *           description: The requesting user's access; null if they are not a member
 *         linkAccess:
 *           type: string
 *           enum: [view, edit]
 *           nullable: true
 *           description: What joining through the share link grants; null when link sharing is off
 *         shareId:
 *           type: string
 *           nullable: true
 *           description: >
 *             Public id for the share link (GET /api/shared/{shareId}). Sent to the owner, and to
 *             others only while link sharing is on.
 *         imageCount:
 *           type: integer
 *         coverUrl:
 *           type: string
 *           nullable: true
 *           description: Thumbnail of the most recently saved image
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CollectionWithImages:
 *       allOf:
 *         - $ref: '#/components/schemas/Collection'
 *         - type: object
 *           properties:
 *             images:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CollectionImage'
 */

/**
 * Reads a collection's name and description from a request body.
 * @param {object} body         The request body
 * @param {object} options
 * @param {boolean} options.partial     True for an update, where every field is optional
 * @returns {{ name?: string, description?: string }}   The trimmed fields that were sent
 * @throws {HttpError} 400 if a field is invalid, or an update has nothing to change
 */
const readCollectionFields = (body, { partial }) => {
  const { name, description } = body ?? {};
  const fields = {};

  if (name !== undefined || !partial) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > Collections.NAME_MAX_LENGTH) {
      throw new HttpError(400, `name must be 1-${Collections.NAME_MAX_LENGTH} characters`);
    }
    fields.name = trimmed;
  }

  if (description !== undefined) {
    if (
      typeof description !== 'string' ||
      description.length > Collections.DESCRIPTION_MAX_LENGTH
    ) {
      throw new HttpError(
        400,
        `description must be text of at most ${Collections.DESCRIPTION_MAX_LENGTH} characters`,
      );
    }
    fields.description = description.trim();
  }

  if (partial && Object.keys(fields).length === 0) {
    throw new HttpError(400, 'Send a name or description to change');
  }
  return fields;
};

/**
 * Re-reads the collection in req.collection after a change and sends it.
 */
const sendUpdatedCollection = async (req, res) => {
  res.json(await Collections.findCollectionForUser(req.pool, req.collection.id, req.user.id));
};

router.use(requireAuth);

/**
 * @openapi
 * /api/collections:
 *   get:
 *     summary: List the collections the user owns or is a member of
 *     description: >
 *       Most recently changed first, one page at a time (20 by default). The total across all pages
 *       is in the X-Total-Count header.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           enum: [all, owned, shared]
 *           default: all
 *         description: >
 *           Which collections to list: all of them, only the ones the user owns, or only the ones
 *           shared with them by other users. X-Total-Count counts the same set.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of collections to return (default 20, max 100)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number (1-based)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of collections to skip
 *     responses:
 *       200:
 *         description: The user's collections
 *         headers:
 *           X-Total-Count:
 *             schema:
 *               type: integer
 *             description: Number of collections across all pages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Collection'
 *       400:
 *         description: Invalid filter or pagination parameter
 *       401:
 *         description: Missing, invalid, or expired access token
 */
router.get('/', async (req, res) => {
  const { filter = 'all' } = req.query;
  if (!Collections.COLLECTION_FILTERS.includes(filter)) {
    throw new HttpError(400, `filter must be one of: ${Collections.COLLECTION_FILTERS.join(', ')}`);
  }
  const pagination = readPagination(req.query);
  const collections = await Collections.listCollectionsForUser(req.pool, req.user.id, {
    filter,
    ...pagination,
  });
  const total = await Collections.countCollectionsForUser(req.pool, req.user.id, { filter });
  res.set('X-Total-Count', String(total));
  res.json(collections);
});

/**
 * @openapi
 * /api/collections:
 *   post:
 *     summary: Create a collection owned by the user
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: The new collection
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Collection'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing, invalid, or expired access token
 */
router.post('/', async (req, res) => {
  const fields = readCollectionFields(req.body, { partial: false });
  const collection = await Collections.createCollection(req.pool, {
    ownerId: req.user.id,
    ...fields,
  });
  res.status(201).location(`${req.baseUrl}/${collection.id}`).json(collection);
});

/**
 * @openapi
 * /api/collections/{collectionId}:
 *   get:
 *     summary: Get a collection and its images
 *     description: Needs view permission. Images come one page at a time (20 by default); see limit, page and offset.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of images to return
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number (1-based)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of images to skip
 *     responses:
 *       200:
 *         description: The collection, with its images newest first
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollectionWithImages'
 *       400:
 *         description: Invalid pagination parameter
 *       401:
 *         description: Missing, invalid, or expired access token
 *       404:
 *         description: No such collection, or the user has no access to it
 */
router.get('/:collectionId', requireCollectionPermission(Permission.VIEW), async (req, res) => {
  const pagination = readPagination(req.query);
  const images = await CollectionImages.listImages(req.pool, req.collection.id, pagination);
  res.json({ ...req.collection.toJSON(), images });
});

/**
 * @openapi
 * /api/collections/{collectionId}:
 *   patch:
 *     summary: Rename a collection or change its description
 *     description: Needs edit permission.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: The updated collection
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Collection'
 *       400:
 *         description: Validation error
 *       403:
 *         description: The user can only view this collection
 *       404:
 *         description: No such collection, or the user has no access to it
 */
router.patch('/:collectionId', requireCollectionPermission(Permission.EDIT), async (req, res) => {
  const fields = readCollectionFields(req.body, { partial: true });
  await Collections.updateCollection(req.pool, req.collection.id, fields);
  await sendUpdatedCollection(req, res);
});

/**
 * @openapi
 * /api/collections/{collectionId}:
 *   delete:
 *     summary: Delete a collection, its images and its members
 *     description: Needs own permission.
 *     tags:
 *       - Collections
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *     responses:
 *       204:
 *         description: Deleted
 *       403:
 *         description: The user does not own this collection
 *       404:
 *         description: No such collection, or the user has no access to it
 */
router.delete('/:collectionId', requireCollectionPermission(Permission.OWN), async (req, res) => {
  await Collections.deleteCollection(req.pool, req.collection.id);
  res.status(204).end();
});

/**
 * @openapi
 * /api/collections/{collectionId}/share-link:
 *   put:
 *     summary: Turn on link sharing, or change what the link grants
 *     description: >
 *       Needs own permission. Anyone with the link can view the collection without logging in, and
 *       a logged-in user can join it as a member with the given access.
 *     tags:
 *       - Sharing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - access
 *             properties:
 *               access:
 *                 type: string
 *                 enum: [view, edit]
 *     responses:
 *       200:
 *         description: The collection, including its shareId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Collection'
 *       400:
 *         description: access is not view or edit
 *       403:
 *         description: The user does not own this collection
 *       404:
 *         description: No such collection, or the user has no access to it
 *   delete:
 *     summary: Turn off link sharing
 *     description: >
 *       Needs own permission. The link stops working. Users who already joined through it stay
 *       members.
 *     tags:
 *       - Sharing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *     responses:
 *       200:
 *         description: The collection
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Collection'
 *       403:
 *         description: The user does not own this collection
 *       404:
 *         description: No such collection, or the user has no access to it
 */
router
  .route('/:collectionId/share-link')
  .all(requireCollectionPermission(Permission.OWN))
  .put(async (req, res) => {
    const { access } = req.body ?? {};
    if (access !== Permission.VIEW && access !== Permission.EDIT) {
      throw new HttpError(400, `access must be "${Permission.VIEW}" or "${Permission.EDIT}"`);
    }
    await Collections.setLinkAccess(req.pool, req.collection.id, access);
    await sendUpdatedCollection(req, res);
  })
  .delete(async (req, res) => {
    await Collections.setLinkAccess(req.pool, req.collection.id, null);
    await sendUpdatedCollection(req, res);
  });

/**
 * @openapi
 * /api/collections/{collectionId}/share-link/reset:
 *   post:
 *     summary: Replace the share link with a new one
 *     description: >
 *       Needs own permission. Links shared before stop working. Users who already joined through
 *       one stay members.
 *     tags:
 *       - Sharing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *     responses:
 *       200:
 *         description: The collection, with its new shareId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Collection'
 *       403:
 *         description: The user does not own this collection
 *       404:
 *         description: No such collection, or the user has no access to it
 */
router.post(
  '/:collectionId/share-link/reset',
  requireCollectionPermission(Permission.OWN),
  async (req, res) => {
    await Collections.resetShareLink(req.pool, req.collection.id);
    await sendUpdatedCollection(req, res);
  },
);

router.use('/:collectionId/members', members);
router.use('/:collectionId/images', images);

/**
 * @openapi
 * components:
 *   parameters:
 *     CollectionId:
 *       in: path
 *       name: collectionId
 *       required: true
 *       schema:
 *         type: integer
 *         minimum: 1
 */

module.exports = router;
