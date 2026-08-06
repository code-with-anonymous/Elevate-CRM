// ─────────────────────────────────────────────────────────────────────────────
// routes/users.routes.js — /api/users/* (the signed-in user's own record)
//
// No RBAC guard here on purpose: every handler acts on req.user.sub, so a
// viewer editing "their own profile" is correct behaviour. Acting on someone
// else lives in team.routes.js, which IS guarded.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/users.controller');

const router = Router();

router.use(verifyToken);

// PATCH /api/users/me
router.patch(
  '/me',
  [
    body('firstName').optional().trim().isLength({ min: 1, max: 50 })
      .withMessage('First name must be 1-50 characters'),
    body('lastName').optional().trim().isLength({ min: 1, max: 50 })
      .withMessage('Last name must be 1-50 characters'),
    body('phone').optional({ nullable: true }).trim().isLength({ max: 30 })
      .withMessage('Phone number too long'),
  ],
  validate,
  ctrl.updateMe
);

// POST /api/users/email — de-verifies and re-sends the verification mail
router.post(
  '/email',
  [body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail()],
  validate,
  ctrl.changeEmail
);

// POST /api/users/avatar — base64 data URL, capped at 200KB decoded.
// app.js mounts a larger express.json() for this path specifically.
router.post('/avatar', ctrl.uploadAvatar);
router.delete('/avatar', ctrl.removeAvatar);

// GET  /api/users/notifications
// PATCH /api/users/notifications — accepts a partial { preferences: {…} } map
router.get('/notifications', ctrl.getNotificationPreferences);
router.patch('/notifications', ctrl.updateNotificationPreferences);

// DELETE /api/users/me — soft delete; owner is refused
router.delete('/me', ctrl.deleteMe);

module.exports = router;
