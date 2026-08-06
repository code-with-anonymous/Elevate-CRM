// ─────────────────────────────────────────────────────────────────────────────
// routes/team.routes.js — /api/team/*
//
// Guards are per-route, not per-file: reading the roster is open to any
// member, mutating it is owner/admin only. A blanket router.use(requireRole)
// would have forced the Leads assignee dropdown to go somewhere else for the
// same list.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { body, param } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/team.controller');

const router = Router();

router.use(verifyToken);

const adminOnly = requireRole('owner', 'admin');
const objectId = (field) =>
  param(field).isMongoId().withMessage('Invalid id');

// ── Members ───────────────────────────────────────────────────────────────────

// GET /api/team/members — any authenticated member
router.get('/members', ctrl.getMembers);

// PATCH /api/team/members/:id/role — owner/admin, plus target checks in the controller
router.patch(
  '/members/:id/role',
  adminOnly,
  [
    objectId('id'),
    body('role').isIn(['admin', 'manager', 'member', 'viewer'])
      .withMessage('Role must be admin, manager, member, or viewer'),
  ],
  validate,
  ctrl.updateMemberRole
);

// DELETE /api/team/members/:id — owner/admin
router.delete('/members/:id', adminOnly, [objectId('id')], validate, ctrl.removeMember);

// ── Invitations ───────────────────────────────────────────────────────────────

// GET /api/team/invites — owner/admin (pending email addresses aren't roster data)
router.get('/invites', adminOnly, ctrl.getInvites);

// POST /api/team/invites/:id/resend — rotates the token, extends the TTL
router.post('/invites/:id/resend', adminOnly, [objectId('id')], validate, ctrl.resendInvite);

// DELETE /api/team/invites/:id
router.delete('/invites/:id', adminOnly, [objectId('id')], validate, ctrl.revokeInvite);

module.exports = router;
