// ─────────────────────────────────────────────────────────────────────────────
// routes/dashboard.routes.js — All /api/dashboard/* routes
// All routes: protected by verifyToken middleware
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/dashboard.controller');

const router = Router();

// All dashboard routes require a valid JWT (verifyToken attaches req.organizationId)
router.use(verifyToken);

// GET /api/dashboard/stats
// Returns: pipelineValue, weeklyRevenue, conversion
router.get('/stats', ctrl.getStats);

// GET /api/dashboard/pipeline-chart?period=monthly|annually
// Returns: period, data[], peakMonth, peakGrowth
router.get('/pipeline-chart', ctrl.getPipelineChart);

// GET /api/dashboard/lead-activity
// Returns: activities[] — last 20 status changes
router.get('/lead-activity', ctrl.getLeadActivity);

// GET /api/dashboard/follow-ups
// Returns: followUps[] — upcoming tasks sorted by urgency
router.get('/follow-ups', ctrl.getFollowUps);

// GET /api/dashboard/leads-by-source
// Returns: total, sources[]
router.get('/leads-by-source', ctrl.getLeadsBySource);

// GET /api/dashboard/revenue-trend
// Returns: totalWon, trend[]
router.get('/revenue-trend', ctrl.getRevenueTrend);

// POST /api/dashboard/ai-insights
// Returns: insights[], generatedAt, pipelineSummary
router.post('/ai-insights', ctrl.getAIInsights);

module.exports = router;
