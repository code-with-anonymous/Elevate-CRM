// ─────────────────────────────────────────────────────────────────────────────
// routes/deals.routes.js
// RBAC policy matches leads.routes.js — read/viewer, write/member, delete/manager.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const express = require('express');
const router  = express.Router();

const { protect } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const {
  getDeals,
  getDeal,
  createDeal,
  updateDeal,
  moveDealStage,
  deleteDeal,
} = require('../controllers/deals.controller');

// All routes require authentication
router.use(protect);

const canWrite = requireMinRole('member');
const canDelete = requireMinRole('manager');

router.route('/')
  .get(getDeals)
  .post(canWrite, createDeal);

router.route('/:id')
  .get(getDeal)
  .patch(canWrite, updateDeal)
  .delete(canDelete, deleteDeal);

// Dedicated stage-move for drag-drop (keeps optimistic update clean).
// A viewer dragging a card now gets a 403 and the optimistic update reverts —
// which is exactly what useMoveDealStage's onError already handles.
router.patch('/:id/stage', canWrite, moveDealStage);

module.exports = router;
