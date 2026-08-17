// ─────────────────────────────────────────────────────────────────────────────
// routes/leads.routes.js
//
// RBAC policy, applied identically across leads / deals / contacts / tasks:
//   · read   (GET)          — any authenticated user, viewer included
//   · write  (POST, PATCH)  — member and above; a viewer is read-only
//   · delete (DELETE)       — manager and above; deletion is not undoable
//
// Before this, `router.use(verifyToken)` was the only guard, so a viewer could
// DELETE a lead with curl while the UI politely hid the button.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const { aiLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/leads.controller');

const router = Router();

router.use(verifyToken);

const canWrite = requireMinRole('member');
const canDelete = requireMinRole('manager');

router.get('/', ctrl.getLeads);
router.post('/', canWrite, ctrl.createLead);
router.get('/users', ctrl.getOrgUsers);
router.get('/:id', ctrl.getLeadById);
router.patch('/:id', canWrite, ctrl.updateLead);
router.delete('/:id', canDelete, ctrl.deleteLead);
router.patch('/:id/status', canWrite, ctrl.updateLeadStatus);

// AI generation — write-gated rather than read-gated, because a viewer should
// not be able to spend paid Gemini quota. aiLimiter is per-user and sits after
// the router-wide verifyToken, so req.user.sub is populated when it keys.
router.post('/:id/ai-summary', canWrite, aiLimiter, ctrl.getLeadAISummary);
router.post('/:id/ai-email', canWrite, aiLimiter, ctrl.generateLeadEmail);

module.exports = router;
