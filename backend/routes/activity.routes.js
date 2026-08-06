// ─────────────────────────────────────────────────────────────────────────────
// routes/activity.routes.js — /api/activity-log
//
// Readable by any authenticated member. It only surfaces events about records
// they can already read, so gating it above `viewer` would hide a summary of
// data that's visible one click away.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/activity.controller');

const router = Router();

router.use(verifyToken);

// GET /api/activity-log?page=&limit=&type=lead|task|deal|member
// Returns: activities[], total, page, limit, totalPages, types[]
router.get('/', ctrl.getActivityLog);

module.exports = router;
