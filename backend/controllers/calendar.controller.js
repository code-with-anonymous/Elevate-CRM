// ─────────────────────────────────────────────────────────────────────────────
// controllers/calendar.controller.js — Unified month view over Tasks + Deals
//
// No service layer here on purpose: this is two org-scoped finds and a reshape,
// not aggregation. Reports gets a service; Calendar does not.
//
// All date maths is UTC (matching dashboard.service.js). Timezone *display* is
// a frontend concern — the API always speaks UTC.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const Task         = require('../models/Task');
const Deal         = require('../models/Deal');
const ApiResponse  = require('../utils/ApiResponse');
const ApiError     = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate + default the month/year query params.
 * Absent → current UTC month. Invalid → 400 (never a silently empty calendar).
 * @returns {{ month: number, year: number }}  month is 1-12
 */
function parseMonthYear(query) {
  const now = new Date();

  const month = query.month === undefined
    ? now.getUTCMonth() + 1
    : Number.parseInt(query.month, 10);

  const year = query.year === undefined
    ? now.getUTCFullYear()
    : Number.parseInt(query.year, 10);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw ApiError.badRequest('month must be an integer between 1 and 12', 'INVALID_MONTH');
  }
  if (!Number.isInteger(year) || year < 1970 || year > 2999) {
    throw ApiError.badRequest('year must be a valid 4-digit year', 'INVALID_YEAR');
  }

  return { month, year };
}

/**
 * Half-open UTC range for a month: [start, end).
 * $lt on the end — a date at exactly midnight on the 1st belongs to the NEXT
 * month only, otherwise it renders in two months at once.
 */
function monthRangeUTC(month, year) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    end:   new Date(Date.UTC(year, month,     1, 0, 0, 0, 0)),
  };
}

/** Shape a populated `assignedTo` doc into the flat assignee the UI expects. */
function toAssignee(user) {
  if (!user) return null;
  return {
    id:        user._id.toString(),
    firstName: user.firstName,
    lastName:  user.lastName,
    avatarUrl: user.avatarUrl || null,
  };
}

/** Best-effort display label for a polymorphic related record. */
function relatedLabel(doc) {
  if (!doc) return null;
  if (doc.title) return doc.title;                                  // Deal
  const name = [doc.firstName, doc.lastName].filter(Boolean).join(' ');
  return name || doc.company || null;                               // Lead / Contact
}

// ── GET /api/calendar/events?month=&year=&types= ──────────────────────────────
//
// Returns one normalized event list so the calendar grid never branches on
// "is this a task or a deal" to find a date.
//
//   { id, type, title, date, priority, status, value, assignee, relatedTo }
//
const getEvents = asyncHandler(async (req, res) => {
  const { month, year } = parseMonthYear(req.query);
  const { start, end }  = monthRangeUTC(month, year);

  // Optional ?types=task,deal — powers the frontend's "show deals" toggle.
  // Absent = both.
  const requested   = String(req.query.types || 'task,deal')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const wantTasks = requested.includes('task');
  const wantDeals = requested.includes('deal');

  if (!wantTasks && !wantDeals) {
    throw ApiError.badRequest('types must include "task" and/or "deal"', 'INVALID_TYPES');
  }

  // Two parallel finds beat a $unionWith here: Mongoose handles the populates,
  // the two documents have genuinely different shapes, and one org-month is
  // tens of documents. Aggregate when reducing, not when fetching.
  const [tasks, deals] = await Promise.all([
    wantTasks
      ? Task.find({
          organizationId: req.organizationId,
          dueDate: { $gte: start, $lt: end },
        })
          .select('title status priority dueDate assignedTo relatedTo relatedModel')
          .populate('assignedTo', 'firstName lastName avatarUrl')
          .populate('relatedTo', 'firstName lastName company title')
          .lean()
      : [],

    wantDeals
      ? Deal.find({
          organizationId: req.organizationId,
          expectedCloseDate: { $gte: start, $lt: end },
        })
          .select('title stage value currency expectedCloseDate assignedTo leadId')
          .populate('assignedTo', 'firstName lastName avatarUrl')
          .populate('leadId', 'firstName lastName company')
          .lean()
      : [],
  ]);

  // ── Normalize both into the single event contract ──────────────────────────
  const taskEvents = tasks.map((t) => ({
    id:        t._id.toString(),
    type:      'task',
    title:     t.title,
    date:      t.dueDate.toISOString(),
    status:    t.status,
    priority:  t.priority,
    value:     null,
    currency:  null,
    assignee:  toAssignee(t.assignedTo),
    relatedTo: t.relatedTo
      ? { id: t.relatedTo._id.toString(), model: t.relatedModel, label: relatedLabel(t.relatedTo) }
      : null,
  }));

  const dealEvents = deals.map((d) => ({
    id:        d._id.toString(),
    type:      'deal',
    title:     d.title,
    date:      d.expectedCloseDate.toISOString(),
    status:    d.stage,
    priority:  null,
    value:     d.value,
    currency:  d.currency || 'USD',
    assignee:  toAssignee(d.assignedTo),
    relatedTo: d.leadId
      ? { id: d.leadId._id.toString(), model: 'Lead', label: relatedLabel(d.leadId) }
      : null,
  }));

  const events = [...taskEvents, ...dealEvents].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  return ApiResponse.ok(res, 'Calendar events', {
    month,
    year,
    range: { from: start.toISOString(), to: end.toISOString() },
    counts: { tasks: taskEvents.length, deals: dealEvents.length, total: events.length },
    events,
  });
});

module.exports = { getEvents };
