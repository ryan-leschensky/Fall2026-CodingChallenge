const express = require('express');
const HttpError = require('../lib/http-error');
const { parsePositiveInt } = require('../lib/pagination');
const Pixabay = require('../lib/pixabay');
const { searchLimit } = require('../middleware/rate-limit');
const requireAuth = require('../middleware/require-auth');
const CollectionImages = require('../models/collection-images');

const router = express.Router();

const DEFAULT_LIMIT = 20;

/**
 * @openapi
 * components:
 *   schemas:
 *     SearchResult:
 *       type: object
 *       description: >
 *         A photo found on Pixabay. Its source, sourceId, imageUrl, thumbnailUrl, pageUrl, width,
 *         height and tags can be sent as they are to POST /api/collections/{collectionId}/images.
 *       properties:
 *         source:
 *           type: string
 *           example: pixabay
 *         sourceId:
 *           type: string
 *         imageUrl:
 *           type: string
 *           format: uri
 *           description: Full-size image, to save
 *         thumbnailUrl:
 *           type: string
 *           format: uri
 *         previewUrl:
 *           type: string
 *           format: uri
 *           description: Medium-size image (about 640px) to show in results. Expires after a day.
 *         previewWidth:
 *           type: integer
 *         previewHeight:
 *           type: integer
 *         pageUrl:
 *           type: string
 *           format: uri
 *           description: The photo's page on Pixabay, for attribution
 *         width:
 *           type: integer
 *         height:
 *           type: integer
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         author:
 *           type: string
 *           description: The photographer's Pixabay username, to credit them
 *         savedIn:
 *           type: array
 *           items:
 *             type: integer
 *           description: IDs of the user's collections (owned or shared) that already have it
 */

/**
 * @openapi
 * /api/search/images:
 *   get:
 *     summary: Search Pixabay for photos
 *     description: >
 *       Safe-search photos, most relevant first. Pixabay only pages through the first 500
 *       results; a page past the end is empty. Each result says which of the user's collections
 *       already have it. Limited to 30 searches a minute per user.
 *     tags:
 *       - Search
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: What to search for
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number (1-based)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 3
 *           maximum: 100
 *         description: Results per page (default 20)
 *     responses:
 *       200:
 *         description: One page of results
 *         headers:
 *           X-Total-Count:
 *             schema:
 *               type: integer
 *             description: How many results can be paged through (at most 500); absent past the end
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SearchResult'
 *       400:
 *         description: Missing or invalid q, page or limit
 *       401:
 *         description: Missing, invalid, or expired access token
 *       429:
 *         description: Too many searches by this user; see Retry-After
 *       502:
 *         description: Pixabay could not be reached
 *       503:
 *         description: This server's Pixabay allowance is used up for the minute
 */
router.get('/images', requireAuth, searchLimit, async (req, res) => {
  const { q } = req.query;
  if (typeof q !== 'string' || !q.trim() || q.trim().length > Pixabay.QUERY_MAX_LENGTH) {
    throw new HttpError(400, `q must be 1-${Pixabay.QUERY_MAX_LENGTH} characters`);
  }
  const page = parsePositiveInt(req.query.page, 'page', 1000) ?? 1;
  const limit = parsePositiveInt(req.query.limit, 'limit', Pixabay.MAX_PER_PAGE) ?? DEFAULT_LIMIT;
  if (limit < Pixabay.MIN_PER_PAGE) {
    throw new HttpError(400, `limit must be at least ${Pixabay.MIN_PER_PAGE}`);
  }

  const { total, results } = await Pixabay.searchImages({ query: q, page, perPage: limit });
  const saved = await CollectionImages.findSavedCollections(
    req.pool,
    req.user.id,
    'pixabay',
    results.map(result => result.sourceId),
  );

  if (total !== null) {
    res.set('X-Total-Count', String(total));
  }
  res.json(results.map(result => ({ ...result, savedIn: saved.get(result.sourceId) ?? [] })));
});

module.exports = router;
