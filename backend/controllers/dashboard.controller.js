// ─────────────────────────────────────────────────────────────────────────────
// controllers/dashboard.controller.js — Thin HTTP layer, delegates to service
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const dashboardService = require('../services/dashboard.service');
const ApiResponse      = require('../utils/ApiResponse');
const asyncHandler     = require('../utils/asyncHandler');

// ── Helper: extract optional date range from query params ────────────────────
function parseDateRange(query) {
  const range = {};
  if (query.from) range.from = query.from;
  if (query.to)   range.to   = query.to;
  return range;
}

// ── GET /api/dashboard/stats ──────────────────────────────────────────────────
const getStats = asyncHandler(async (req, res) => {
  const dateRange = parseDateRange(req.query);
  const data = await dashboardService.getStats(req.organizationId, dateRange);
  return ApiResponse.ok(res, 'Dashboard stats', data);
});

// ── GET /api/dashboard/pipeline-chart ────────────────────────────────────────
const getPipelineChart = asyncHandler(async (req, res) => {
  const period    = req.query.period === 'annually' ? 'annually' : 'monthly';
  const dateRange = parseDateRange(req.query);
  const data = await dashboardService.getPipelineChart(req.organizationId, period, dateRange);
  return ApiResponse.ok(res, 'Pipeline chart data', data);
});

// ── GET /api/dashboard/lead-activity ─────────────────────────────────────────
const getLeadActivity = asyncHandler(async (req, res) => {
  const data = await dashboardService.getLeadActivity(req.organizationId);
  return ApiResponse.ok(res, 'Lead activity', data);
});

// ── GET /api/dashboard/follow-ups ────────────────────────────────────────────
const getFollowUps = asyncHandler(async (req, res) => {
  const data = await dashboardService.getFollowUps(req.organizationId);
  return ApiResponse.ok(res, 'Follow-ups', data);
});

// ── GET /api/dashboard/leads-by-source ───────────────────────────────────────
const getLeadsBySource = asyncHandler(async (req, res) => {
  const dateRange = parseDateRange(req.query);
  const data = await dashboardService.getLeadsBySource(req.organizationId, dateRange);
  return ApiResponse.ok(res, 'Leads by source', data);
});

// ── GET /api/dashboard/revenue-trend ─────────────────────────────────────────
const getRevenueTrend = asyncHandler(async (req, res) => {
  const dateRange = parseDateRange(req.query);
  const data = await dashboardService.getRevenueTrend(req.organizationId, dateRange);
  return ApiResponse.ok(res, 'Revenue trend', data);
});

// ── POST /api/dashboard/ai-insights ──────────────────────────────────────────
const getAIInsights = asyncHandler(async (req, res) => {
  const data = await dashboardService.getAIInsights(req.organizationId);
  return ApiResponse.ok(res, 'AI insights', data);
});

module.exports = {
  getStats,
  getPipelineChart,
  getLeadActivity,
  getFollowUps,
  getLeadsBySource,
  getRevenueTrend,
  getAIInsights,
};
