const express = require('express');
const HttpError = require('../lib/http-error');
const { parseId } = require('../lib/ids');
const { Permission } = require('../lib/permissions');
const requireCollectionPermission = require('../middleware/collection-access');
const CollectionImages = require('../models/collection-images');

// Mounted at /api/collections/:collectionId/images, after requireAuth
const router = express.Router({ mergeParams: true });

const {
  URL_MAX_LENGTH,
  SOURCE_PATTERN,
  SOURCE_ID_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  MAX_TAGS,
} = CollectionImages;

// Largest width or height accepted, well past any real image
const MAX_DIMENSION = 100_000;

/**
 * @openapi
 * components:
 *   schemas:
 *     CollectionImage:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         collectionId:
 *           type: integer
 *         addedBy:
 *           type: integer
 *           nullable: true
 *           description: User ID of whoever saved it; null if that account was deleted
 *         source:
 *           type: string
 *           example: pixabay
 *         sourceId:
 *           type: string
 *           nullable: true
 *         imageUrl:
 *           type: string
 *           format: uri
 *         thumbnailUrl:
 *           type: string
 *           format: uri
 *           nullable: true
 *         pageUrl:
 *           type: string
 *           format: uri
 *           nullable: true
 *         width:
 *           type: integer
 *           nullable: true
 *         height:
 *           type: integer
 *           nullable: true
 *         title:
 *           type: string
 *         note:
 *           type: string
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     EditableImageFields:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           maxLength: 200
 *         note:
 *           type: string
 *           maxLength: 2000
 *         tags:
 *           type: array
 *           maxItems: 20
 *           items:
 *             type: string
 *             maxLength: 50
 *   parameters:
 *     ImageId:
 *       in: path
 *       name: imageId
 *       required: true
 *       schema:
 *         type: integer
 *         minimum: 1
 */

/**
 * @returns {string} The URL, normalized
 * @throws {HttpError} 400 unless it is an http(s) URL with no username or password
 */
const readUrl = (value, field) => {
  let url;
  try {
    url = typeof value === 'string' && value.length <= URL_MAX_LENGTH ? new URL(value) : null;
  } catch {
    url = null;
  }
  if (
    !url ||
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username ||
    url.password ||
    url.href.length > URL_MAX_LENGTH
  ) {
    throw new HttpError(400, `${field} must be an http or https URL`);
  }
  return url.href;
};

const readOptionalUrl = (value, field) => (value == null ? null : readUrl(value, field));

const readText = (value, field, maxLength) => {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new HttpError(400, `${field} must be text of at most ${maxLength} characters`);
  }
  return value.trim();
};

const readDimension = (value, field) => {
  if (value == null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_DIMENSION) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }
  return value;
};

/**
 * @returns {string[]} The tags, trimmed, without blanks or repeats
 */
const readTags = value => {
  const valid =
    Array.isArray(value) &&
    value.length <= MAX_TAGS &&
    value.every(tag => typeof tag === 'string' && tag.length <= TAG_MAX_LENGTH);
  if (!valid) {
    throw new HttpError(
      400,
      `tags must be a list of at most ${MAX_TAGS} tags of at most ${TAG_MAX_LENGTH} characters`,
    );
  }
  return [...new Set(value.map(tag => tag.trim()).filter(Boolean))];
};

/**
 * Reads the title, note and tags a user can edit from a request body.
 * @returns {{ title?: string, note?: string, tags?: string[] }}  The fields that were sent
 */
const readEditableFields = body => {
  const { title, note, tags } = body ?? {};
  const fields = {};
  if (title !== undefined) {
    fields.title = readText(title, 'title', TITLE_MAX_LENGTH);
  }
  if (note !== undefined) {
    fields.note = readText(note, 'note', NOTE_MAX_LENGTH);
  }
  if (tags !== undefined) {
    fields.tags = readTags(tags);
  }
  return fields;
};

/**
 * Reads a new image from a request body.
 * @throws {HttpError} 400 if any field is invalid
 */
const readNewImage = body => {
  const { imageUrl, thumbnailUrl, pageUrl, source, sourceId, width, height } = body ?? {};

  if (source !== undefined && (typeof source !== 'string' || !SOURCE_PATTERN.test(source))) {
    throw new HttpError(400, 'source must be 1-30 lowercase letters, digits, "_" or "-"');
  }

  // Pixabay and similar APIs use numeric ids, so accept numbers and store them as text
  const sourceIdText = typeof sourceId === 'number' ? String(sourceId) : sourceId;
  if (
    sourceIdText != null &&
    (typeof sourceIdText !== 'string' ||
      !sourceIdText ||
      sourceIdText.length > SOURCE_ID_MAX_LENGTH)
  ) {
    throw new HttpError(400, `sourceId must be 1-${SOURCE_ID_MAX_LENGTH} characters`);
  }

  return {
    imageUrl: readUrl(imageUrl, 'imageUrl'),
    thumbnailUrl: readOptionalUrl(thumbnailUrl, 'thumbnailUrl'),
    pageUrl: readOptionalUrl(pageUrl, 'pageUrl'),
    source,
    sourceId: sourceIdText ?? null,
    width: readDimension(width, 'width'),
    height: readDimension(height, 'height'),
    ...readEditableFields(body),
  };
};

/**
 * @returns {number} The image id in req.params.imageId
 * @throws {HttpError} 404 if it is not a valid id
 */
const imageIdOf = req => {
  const id = parseId(req.params.imageId);
  if (!id) {
    throw new HttpError(404, 'Image not found');
  }
  return id;
};

/**
 * @openapi
 * /api/collections/{collectionId}/images:
 *   get:
 *     summary: List a collection's images
 *     description: Needs view permission. Newest first.
 *     tags:
 *       - Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *     responses:
 *       200:
 *         description: The images
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CollectionImage'
 *       404:
 *         description: No such collection, or the user has no access to it
 */
router.get('/', requireCollectionPermission(Permission.VIEW), async (req, res) => {
  res.json(await CollectionImages.listImages(req.pool, req.collection.id));
});

/**
 * @openapi
 * /api/collections/{collectionId}/images:
 *   post:
 *     summary: Save an image to a collection
 *     description: Needs edit permission.
 *     tags:
 *       - Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/EditableImageFields'
 *               - type: object
 *                 required:
 *                   - imageUrl
 *                 properties:
 *                   imageUrl:
 *                     type: string
 *                     format: uri
 *                   thumbnailUrl:
 *                     type: string
 *                     format: uri
 *                   pageUrl:
 *                     type: string
 *                     format: uri
 *                     description: Page the image was found on, for attribution
 *                   source:
 *                     type: string
 *                     example: pixabay
 *                   sourceId:
 *                     oneOf:
 *                       - type: string
 *                       - type: integer
 *                   width:
 *                     type: integer
 *                   height:
 *                     type: integer
 *     responses:
 *       201:
 *         description: The saved image
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollectionImage'
 *       400:
 *         description: Validation error
 *       403:
 *         description: The user can only view this collection
 *       404:
 *         description: No such collection, or the user has no access to it
 *       409:
 *         description: The image is already in this collection
 */
router.post('/', requireCollectionPermission(Permission.EDIT), async (req, res) => {
  const image = readNewImage(req.body);
  try {
    const saved = await CollectionImages.addImage(req.pool, req.collection.id, req.user.id, image);
    res.status(201).location(`${req.baseUrl}/${saved.id}`).json(saved);
  } catch (err) {
    if (err instanceof CollectionImages.DuplicateImageError) {
      throw new HttpError(409, err.message);
    }
    throw err;
  }
});

/**
 * @openapi
 * /api/collections/{collectionId}/images/{imageId}:
 *   get:
 *     summary: Get one image in a collection
 *     description: Needs view permission.
 *     tags:
 *       - Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *       - $ref: '#/components/parameters/ImageId'
 *     responses:
 *       200:
 *         description: The image
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollectionImage'
 *       404:
 *         description: No such collection or image, or the user has no access
 */
router.get('/:imageId', requireCollectionPermission(Permission.VIEW), async (req, res) => {
  const image = await CollectionImages.findImage(req.pool, req.collection.id, imageIdOf(req));
  if (!image) {
    throw new HttpError(404, 'Image not found');
  }
  res.json(image);
});

/**
 * @openapi
 * /api/collections/{collectionId}/images/{imageId}:
 *   patch:
 *     summary: Edit an image's title, note or tags
 *     description: Needs edit permission.
 *     tags:
 *       - Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *       - $ref: '#/components/parameters/ImageId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/EditableImageFields'
 *             minProperties: 1
 *     responses:
 *       200:
 *         description: The updated image
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollectionImage'
 *       400:
 *         description: Validation error
 *       403:
 *         description: The user can only view this collection
 *       404:
 *         description: No such collection or image, or the user has no access
 */
router.patch('/:imageId', requireCollectionPermission(Permission.EDIT), async (req, res) => {
  const imageId = imageIdOf(req);
  const fields = readEditableFields(req.body);
  if (Object.keys(fields).length === 0) {
    throw new HttpError(400, 'Send a title, note or tags to change');
  }

  const image = await CollectionImages.updateImage(req.pool, req.collection.id, imageId, fields);
  if (!image) {
    throw new HttpError(404, 'Image not found');
  }
  res.json(image);
});

/**
 * @openapi
 * /api/collections/{collectionId}/images/{imageId}:
 *   delete:
 *     summary: Remove an image from a collection
 *     description: Needs edit permission.
 *     tags:
 *       - Images
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *       - $ref: '#/components/parameters/ImageId'
 *     responses:
 *       204:
 *         description: Removed
 *       403:
 *         description: The user can only view this collection
 *       404:
 *         description: No such collection or image, or the user has no access
 */
router.delete('/:imageId', requireCollectionPermission(Permission.EDIT), async (req, res) => {
  const deleted = await CollectionImages.deleteImage(req.pool, req.collection.id, imageIdOf(req));
  if (!deleted) {
    throw new HttpError(404, 'Image not found');
  }
  res.status(204).end();
});

module.exports = router;
