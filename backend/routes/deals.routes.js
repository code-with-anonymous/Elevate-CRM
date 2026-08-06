// ─────────────────────────────────────────────────────────────────────────────
// routes/deals.routes.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const express = require('express');
const router  = express.Router();

const { protect } = require('../middleware/auth');
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

router.route('/')
  .get(getDeals)
  .post(createDeal);

router.route('/:id')
  .get(getDeal)
  .patch(updateDeal)
  .delete(deleteDeal);

// Dedicated stage-move for drag-drop (keeps optimistic update clean)
router.patch('/:id/stage', moveDealStage);

module.exports = router;
