// ─────────────────────────────────────────────────────────────────────────────
// controllers/reports.controller.js — Thin HTTP layer, delegates to service
// Mirrors dashboard.controller.js: parse query, call service, wrap response.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const reportsService = require('../services/reports.service');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// ── Helper: validated date range ─────────────────────────────────────────────
// An unparseable date becomes `Invalid Date`, which Mongo accepts and matches
// nothing — a silently empty report. Reject it at the edge instead.
function parseDateRange(query) {
  const range = {};

  for (const key of ['from', 'to']) {
    if (!query[key]) continue;
    const parsed = new Date(query[key]);
    if (Number.isNaN(parsed.getTime())) {
      throw ApiError.badRequest(`"${key}" is not a valid date`, 'INVALID_DATE');
    }
    range[key] = query[key];
  }

  if (range.from && range.to && new Date(range.from) > new Date(range.to)) {
    throw ApiError.badRequest('"from" must be before "to"', 'INVALID_RANGE');
  }

  return range;
}

// ── GET /api/reports/sales-performance?from=&to=&assignedTo= ─────────────────
const getSalesPerformance = asyncHandler(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const data = await reportsService.getSalesPerformance(req.organizationId, {
    from,
    to,
    assignedTo: req.query.assignedTo || undefined,
  });
  return ApiResponse.ok(res, 'Sales performance', data);
});

// ── GET /api/reports/pipeline-forecast ───────────────────────────────────────
const getPipelineForecast = asyncHandler(async (req, res) => {
  const data = await reportsService.getPipelineForecast(req.organizationId);
  return ApiResponse.ok(res, 'Pipeline forecast', data);
});

// ── GET /api/reports/lead-source-roi?from=&to= ───────────────────────────────
const getLeadSourceRoi = asyncHandler(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const data = await reportsService.getLeadSourceRoi(req.organizationId, { from, to });
  return ApiResponse.ok(res, 'Lead source ROI', data);
});

// ── GET /api/reports/activity-summary?from=&to= ──────────────────────────────
const getActivitySummary = asyncHandler(async (req, res) => {
  const { from, to } = parseDateRange(req.query);
  const data = await reportsService.getActivitySummary(req.organizationId, { from, to });
  return ApiResponse.ok(res, 'Activity summary', data);
});

module.exports = {
  getSalesPerformance,
  getPipelineForecast,
  getLeadSourceRoi,
  getActivitySummary,
};
