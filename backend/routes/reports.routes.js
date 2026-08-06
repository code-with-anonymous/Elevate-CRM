// ─────────────────────────────────────────────────────────────────────────────
// routes/reports.routes.js — All /api/reports/* routes
//
// Guarded at manager+ rather than any-authenticated. Reports expose per-rep
// revenue and org-wide forecast; a `viewer` or `member` seeing every
// colleague's numbers is a decision, not a default.
//
// This is the first route file to actually use middleware/rbac.js — Step 11a
// applies the same treatment to leads/deals/contacts/tasks.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const ctrl = require('../controllers/reports.controller');

const router = Router();

router.use(verifyToken);
router.use(requireMinRole('manager')); // manager | admin | owner

// GET /api/reports/sales-performance?from=&to=&assignedTo=
// Returns: range, rows[] (per rep), totals
router.get('/sales-performance', ctrl.getSalesPerformance);

// GET /api/reports/pipeline-forecast
// Returns: stages[], totals, probabilities
router.get('/pipeline-forecast', ctrl.getPipelineForecast);

// GET /api/reports/lead-source-roi?from=&to=
// Returns: range, rows[] (per source), totals
router.get('/lead-source-roi', ctrl.getLeadSourceRoi);

// GET /api/reports/activity-summary?from=&to=
// Returns: range (incl. `truncated`), series[] (dense, zero-filled), totals
router.get('/activity-summary', ctrl.getActivitySummary);

module.exports = router;
