const express = require('express');
const HttpError = require('../lib/http-error');
const { Permission, isPermission } = require('../lib/permissions');
const requireCollectionPermission = require('../middleware/collection-access');
const Users = require('../models/users');
const CollectionMembers = require('../models/collection-members');

// Mounted at /api/collections/:collectionId/members, after requireAuth
const router = express.Router({ mergeParams: true });

/**
 * @openapi
 * components:
 *   schemas:
 *     Member:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         username:
 *           type: string
 *         permission:
 *           $ref: '#/components/schemas/Permission'
 *         addedAt:
 *           type: string
 *           format: date-time
 *   parameters:
 *     MemberUsername:
 *       in: path
 *       name: username
 *       required: true
 *       schema:
 *         type: string
 *       description: Username of the member (any letter case)
 */

/**
 * Finds the user named in req.params.username.
 * @throws {HttpError} 404 if there is no such user
 */
const findTargetUser = async req => {
  const user = await Users.findUserByUsername(req.pool, req.params.username);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  return user;
};

/**
 * @openapi
 * /api/collections/{collectionId}/members:
 *   get:
 *     summary: List everyone with access to a collection
 *     description: Needs view permission. The owner comes first, then editors, then viewers.
 *     tags:
 *       - Sharing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *     responses:
 *       200:
 *         description: The owner and members
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Member'
 *       404:
 *         description: No such collection, or the user has no access to it
 */
router.get('/', requireCollectionPermission(Permission.VIEW), async (req, res) => {
  res.json(await CollectionMembers.listMembers(req.pool, req.collection.id));
});

/**
 * @openapi
 * /api/collections/{collectionId}/members/{username}:
 *   put:
 *     summary: Share a collection with a user, change their permission, or make them the owner
 *     description: >
 *       Needs own permission. view or edit adds the user as a member or changes their permission.
 *       own transfers ownership to an existing member, and the current owner stays on as an editor.
 *     tags:
 *       - Sharing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *       - $ref: '#/components/parameters/MemberUsername'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permission
 *             properties:
 *               permission:
 *                 $ref: '#/components/schemas/Permission'
 *     responses:
 *       200:
 *         description: Permission changed, or ownership transferred
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Member'
 *       201:
 *         description: User added as a member
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Member'
 *       400:
 *         description: permission is not view, edit or own
 *       403:
 *         description: The user does not own this collection
 *       404:
 *         description: No such collection or user
 *       409:
 *         description: >
 *           The target is the owner, or is being made the owner without being a member first
 */
router.put('/:username', requireCollectionPermission(Permission.OWN), async (req, res) => {
  const { permission } = req.body ?? {};
  if (!isPermission(permission)) {
    throw new HttpError(400, 'permission must be "view", "edit" or "own"');
  }

  const collectionId = req.collection.id;
  const target = await findTargetUser(req);
  if (target.id === req.collection.owner.id) {
    throw new HttpError(409, 'That user already owns this collection');
  }

  if (permission === Permission.OWN) {
    const transferred = await CollectionMembers.transferOwnership(req.pool, {
      collectionId,
      fromUserId: req.user.id,
      toUserId: target.id,
    });
    if (!transferred) {
      throw new HttpError(409, 'Only a member can be made the owner; share the collection first');
    }
    const everyone = await CollectionMembers.listMembers(req.pool, collectionId);
    res.json(everyone.find(member => member.id === target.id));
    return;
  }

  const saved = await CollectionMembers.setMember(req.pool, {
    collectionId,
    userId: target.id,
    permission,
  });
  if (!saved) {
    // Ownership moved to this user after the check above
    throw new HttpError(409, 'That user already owns this collection');
  }
  res.status(saved.created ? 201 : 200).json(saved.member);
});

/**
 * @openapi
 * /api/collections/{collectionId}/members/{username}:
 *   delete:
 *     summary: Remove a member, or leave a collection
 *     description: >
 *       The owner can remove any member. Any member can remove themselves. The owner cannot leave;
 *       they transfer ownership or delete the collection instead.
 *     tags:
 *       - Sharing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CollectionId'
 *       - $ref: '#/components/parameters/MemberUsername'
 *     responses:
 *       204:
 *         description: Removed
 *       403:
 *         description: A member other than the owner tried to remove someone else
 *       404:
 *         description: No such collection, user, or member
 *       409:
 *         description: The owner tried to remove themselves
 */
router.delete('/:username', requireCollectionPermission(Permission.VIEW), async (req, res) => {
  const target = await findTargetUser(req);
  const isSelf = target.id === req.user.id;

  if (target.id === req.collection.owner.id) {
    throw new HttpError(409, 'The owner cannot be removed; transfer ownership first');
  }
  if (!isSelf && req.collection.permission !== Permission.OWN) {
    throw new HttpError(403, 'Only the owner can remove other members');
  }

  const removed = await CollectionMembers.removeMember(req.pool, req.collection.id, target.id);
  if (!removed) {
    throw new HttpError(404, 'That user is not a member of this collection');
  }
  res.status(204).end();
});

module.exports = router;
