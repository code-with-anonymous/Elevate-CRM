// ─────────────────────────────────────────────────────────────────────────────
// services/reports.service.js — ALL reporting aggregation logic
// No req/res here. Every function receives organizationId (ObjectId or string)
// and returns view-ready data.
//
// Calendar has no service because it fetches and reshapes. Reports has one
// because it reduces — every function below is a $group the database should be
// doing, not JavaScript.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Task = require('../models/Task');
const User = require('../models/User');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Ensure organizationId is a Mongoose ObjectId (matches dashboard.service). */
function toObjId(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/**
 * Build a Mongo range object from a {from, to} pair, or null when neither is
 * given. Returning null rather than `{}` lets callers decide whether "no range"
 * means "all time" or "skip this filter entirely" — those differ per report.
 */
function buildRange({ from, to } = {}) {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return Object.keys(range).length ? range : null;
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

const MS_PER_DAY = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// 1. getSalesPerformance — per-rep breakdown
//
// `conversionRate` is leads-won ÷ leads-assigned, NOT deals-won ÷ leads.
// dashboard.service.getStats already defines conversion that way; one word
// meaning two things across two pages is how a product loses its credibility.
//
// Date range semantics differ per metric, deliberately:
//   · leads   — filtered on createdAt  ("leads I picked up in this window")
//   · revenue — filtered on closedAt   ("money I closed in this window")
// A lead created in March and closed in April counts toward March's lead count
// and April's revenue, which is what a sales manager means by both questions.
// ─────────────────────────────────────────────────────────────────────────────
async function getSalesPerformance(organizationId, { from, to, assignedTo } = {}) {
  const orgId = toObjId(organizationId);
  const range = buildRange({ from, to });

  const repFilter = assignedTo ? { assignedTo: toObjId(assignedTo) } : {};

  const leadMatch = {
    organizationId: orgId,
    isDeleted: { $ne: true },
    assignedTo: { $ne: null },
    ...repFilter,
    ...(range ? { createdAt: range } : {}),
  };

  const dealMatch = {
    organizationId: orgId,
    stage: 'Won',
    assignedTo: { $ne: null },
    ...repFilter,
    // Only constrain closedAt when a range was asked for. Applying it always
    // would silently drop Won deals whose closedAt was never stamped.
    ...(range ? { closedAt: range } : {}),
  };

  const [reps, leadRows, dealRows] = await Promise.all([
    User.find({ organizationId: orgId, isActive: true })
      .select('firstName lastName email avatarUrl role')
      .lean(),

    Lead.aggregate([
      { $match: leadMatch },
      {
        $group: {
          _id: '$assignedTo',
          leadsAssigned: { $sum: 1 },
          leadsWon: { $sum: { $cond: [{ $eq: ['$status', 'Won'] }, 1, 0] } },
          leadsLost: { $sum: { $cond: [{ $eq: ['$status', 'Lost'] }, 1, 0] } },
          pipelineValue: {
            $sum: {
              $cond: [{ $in: ['$status', ['Won', 'Lost']] }, 0, { $ifNull: ['$value', 0] }],
            },
          },
        },
      },
    ]),

    Deal.aggregate([
      { $match: dealMatch },
      {
        $group: {
          _id: '$assignedTo',
          dealsWon: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$value', 0] } },
          // $subtract over two dates yields milliseconds. Averaging here rather
          // than in JS keeps the whole calculation in one pass over the index.
          // Deals with no closedAt contribute null, which $avg skips.
          avgCloseMs: {
            $avg: {
              $cond: [
                { $and: [{ $ne: ['$closedAt', null] }, { $ne: ['$createdAt', null] }] },
                { $subtract: ['$closedAt', '$createdAt'] },
                null,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const leadsById = new Map(leadRows.map((r) => [String(r._id), r]));
  const dealsById = new Map(dealRows.map((r) => [String(r._id), r]));

  const rows = reps
    .map((rep) => {
      const id = String(rep._id);
      const l = leadsById.get(id);
      const d = dealsById.get(id);

      const leadsAssigned = l?.leadsAssigned ?? 0;
      const leadsWon = l?.leadsWon ?? 0;
      const dealsWon = d?.dealsWon ?? 0;
      const revenue = d?.revenue ?? 0;

      return {
        userId: id,
        firstName: rep.firstName,
        lastName: rep.lastName,
        email: rep.email,
        avatarUrl: rep.avatarUrl || null,
        role: rep.role,
        leadsAssigned,
        leadsWon,
        leadsLost: l?.leadsLost ?? 0,
        openPipelineValue: l?.pipelineValue ?? 0,
        dealsWon,
        revenue,
        conversionRate: leadsAssigned === 0 ? 0 : round((leadsWon / leadsAssigned) * 100),
        avgDealSize: dealsWon === 0 ? 0 : Math.round(revenue / dealsWon),
        avgDaysToClose: d?.avgCloseMs ? round(d.avgCloseMs / MS_PER_DAY) : null,
      };
    })
    // A rep with nothing in the window is noise in a comparison table. Filtering
    // in JS rather than the pipeline because the reps list is the *outer* join
    // side — the aggregation can't know about users it never grouped.
    .filter((r) => r.leadsAssigned > 0 || r.dealsWon > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const totals = rows.reduce(
    (acc, r) => ({
      leadsAssigned: acc.leadsAssigned + r.leadsAssigned,
      leadsWon: acc.leadsWon + r.leadsWon,
      dealsWon: acc.dealsWon + r.dealsWon,
      revenue: acc.revenue + r.revenue,
    }),
    { leadsAssigned: 0, leadsWon: 0, dealsWon: 0, revenue: 0 }
  );

  return {
    range: { from: from || null, to: to || null },
    rows,
    totals: {
      ...totals,
      conversionRate:
        totals.leadsAssigned === 0 ? 0 : round((totals.leadsWon / totals.leadsAssigned) * 100),
      avgDealSize: totals.dealsWon === 0 ? 0 : Math.round(totals.revenue / totals.dealsWon),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. getPipelineForecast — weighted pipeline value
//
// Keys MUST match the Deal schema enum exactly. The enum is 'Proposal Sent',
// not 'Proposal' — a near-miss key here doesn't throw, it just silently
// weights that stage at zero and under-reports the forecast.
// ─────────────────────────────────────────────────────────────────────────────
const STAGE_PROBABILITY = {
  Lead: 0.1,
  Qualified: 0.25,
  'Proposal Sent': 0.5,
  Negotiation: 0.75,
  Won: 1,
  Lost: 0,
};

/** Pipeline order for display — not alphabetical, not aggregation order. */
const STAGE_ORDER = ['Lead', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'];

async function getPipelineForecast(organizationId) {
  const orgId = toObjId(organizationId);

  const rows = await Deal.aggregate([
    { $match: { organizationId: orgId } },
    {
      $group: {
        _id: '$stage',
        count: { $sum: 1 },
        value: { $sum: { $ifNull: ['$value', 0] } },
      },
    },
  ]);

  const byStage = new Map(rows.map((r) => [r._id, r]));

  const stages = STAGE_ORDER.map((stage) => {
    const row = byStage.get(stage);
    const value = row?.value ?? 0;
    const probability = STAGE_PROBABILITY[stage];
    return {
      stage,
      count: row?.count ?? 0,
      value,
      probability,
      weightedValue: Math.round(value * probability),
    };
  });

  const open = stages.filter((s) => s.stage !== 'Won' && s.stage !== 'Lost');
  const won = stages.find((s) => s.stage === 'Won');

  return {
    stages,
    totals: {
      // The headline number. Open pipeline only — folding Won into a
      // "forecast" reports money already in the bank as money still expected.
      weightedForecast: open.reduce((sum, s) => sum + s.weightedValue, 0),
      openValue: open.reduce((sum, s) => sum + s.value, 0),
      openCount: open.reduce((sum, s) => sum + s.count, 0),
      closedWonValue: won?.value ?? 0,
      closedWonCount: won?.count ?? 0,
    },
    probabilities: STAGE_PROBABILITY,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. getLeadSourceRoi — revenue attributed back to the source that produced it
//
// The join runs Deal → Lead, not Lead → Deal. Won deals are the smaller, more
// selective set, so starting there means $lookup fires once per won deal
// instead of once per lead in the org.
//
// Deals with no leadId (created straight on the board) land in "Direct" rather
// than being dropped — revenue that exists but can't be attributed is a real
// category, and silently discarding it makes the totals not add up.
// ─────────────────────────────────────────────────────────────────────────────
async function getLeadSourceRoi(organizationId, { from, to } = {}) {
  const orgId = toObjId(organizationId);
  const range = buildRange({ from, to });

  const [revenueRows, volumeRows] = await Promise.all([
    Deal.aggregate([
      {
        $match: {
          organizationId: orgId,
          stage: 'Won',
          ...(range ? { closedAt: range } : {}),
        },
      },
      {
        $lookup: {
          from: 'leads',
          localField: 'leadId',
          foreignField: '_id',
          as: 'lead',
          // Narrow the joined doc to the one field we need, so the pipeline
          // isn't dragging whole lead documents through memory.
          pipeline: [{ $project: { source: 1 } }],
        },
      },
      { $unwind: { path: '$lead', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$lead.source', 'Direct'] },
          revenue: { $sum: { $ifNull: ['$value', 0] } },
          dealsWon: { $sum: 1 },
        },
      },
    ]),

    // Lead volume per source, for the denominator. Without it the chart can
    // only say "Referral earned the most", not "Referral converts best".
    Lead.aggregate([
      {
        $match: {
          organizationId: orgId,
          isDeleted: { $ne: true },
          ...(range ? { createdAt: range } : {}),
        },
      },
      {
        $group: {
          _id: '$source',
          leads: { $sum: 1 },
          wonLeads: { $sum: { $cond: [{ $eq: ['$status', 'Won'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const volumeBySource = new Map(volumeRows.map((r) => [r._id ?? 'Other', r]));
  const revenueBySource = new Map(revenueRows.map((r) => [r._id, r]));

  // Union of both sides — a source can have leads but no revenue yet, and
  // "Direct" revenue has no lead rows at all.
  const sources = [...new Set([...volumeBySource.keys(), ...revenueBySource.keys()])];

  const rows = sources
    .map((source) => {
      const v = volumeBySource.get(source);
      const r = revenueBySource.get(source);
      const leads = v?.leads ?? 0;
      const revenue = r?.revenue ?? 0;

      return {
        source,
        leads,
        wonLeads: v?.wonLeads ?? 0,
        dealsWon: r?.dealsWon ?? 0,
        revenue,
        conversionRate: leads === 0 ? 0 : round(((v?.wonLeads ?? 0) / leads) * 100),
        revenuePerLead: leads === 0 ? 0 : Math.round(revenue / leads),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    range: { from: from || null, to: to || null },
    rows,
    totals: {
      revenue: rows.reduce((sum, r) => sum + r.revenue, 0),
      leads: rows.reduce((sum, r) => sum + r.leads, 0),
      dealsWon: rows.reduce((sum, r) => sum + r.dealsWon, 0),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. getActivitySummary — daily counts across three collections
//
// Returns a DENSE series: every day in the range appears, zero-filled. A line
// chart fed a sparse series draws a straight line across the gap, which reads
// as "steady activity" when the truth is "nothing happened".
// ─────────────────────────────────────────────────────────────────────────────
const MAX_RANGE_DAYS = 366;

/** Group-by-UTC-day stage, shared by all three series. */
function dayBucket(field) {
  return {
    $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: 'UTC' } },
      count: { $sum: 1 },
    },
  };
}

async function getActivitySummary(organizationId, { from, to } = {}) {
  const orgId = toObjId(organizationId);

  // Default window: the trailing 30 days, ending today (UTC).
  const end = to ? new Date(to) : new Date();
  end.setUTCHours(23, 59, 59, 999);

  let start = from ? new Date(from) : new Date(end);
  if (!from) start.setUTCDate(start.getUTCDate() - 29);
  start.setUTCHours(0, 0, 0, 0);

  // Clamp rather than let a five-year range generate 1,800 chart points.
  // Reported back in the response — a silent cap reads as complete data.
  const spanDays = Math.floor((end - start) / MS_PER_DAY) + 1;
  const truncated = spanDays > MAX_RANGE_DAYS;
  if (truncated) {
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (MAX_RANGE_DAYS - 1));
    start.setUTCHours(0, 0, 0, 0);
  }

  const range = { $gte: start, $lte: end };

  const [tasksDone, leadsCreated, dealsClosed, dealsWon] = await Promise.all([
    Task.aggregate([
      { $match: { organizationId: orgId, status: 'Done', completedAt: range } },
      dayBucket('completedAt'),
    ]),
    Lead.aggregate([
      { $match: { organizationId: orgId, isDeleted: { $ne: true }, createdAt: range } },
      dayBucket('createdAt'),
    ]),
    Deal.aggregate([
      { $match: { organizationId: orgId, closedAt: range } },
      dayBucket('closedAt'),
    ]),
    Deal.aggregate([
      { $match: { organizationId: orgId, stage: 'Won', closedAt: range } },
      dayBucket('closedAt'),
    ]),
  ]);

  const toMap = (rows) => new Map(rows.map((r) => [r._id, r.count]));
  const tasksMap = toMap(tasksDone);
  const leadsMap = toMap(leadsCreated);
  const closedMap = toMap(dealsClosed);
  const wonMap = toMap(dealsWon);

  const series = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key,
      tasksCompleted: tasksMap.get(key) ?? 0,
      leadsCreated: leadsMap.get(key) ?? 0,
      dealsClosed: closedMap.get(key) ?? 0,
      dealsWon: wonMap.get(key) ?? 0,
    });
  }

  const totals = series.reduce(
    (acc, day) => ({
      tasksCompleted: acc.tasksCompleted + day.tasksCompleted,
      leadsCreated: acc.leadsCreated + day.leadsCreated,
      dealsClosed: acc.dealsClosed + day.dealsClosed,
      dealsWon: acc.dealsWon + day.dealsWon,
    }),
    { tasksCompleted: 0, leadsCreated: 0, dealsClosed: 0, dealsWon: 0 }
  );

  return {
    range: { from: start.toISOString(), to: end.toISOString(), days: series.length, truncated },
    series,
    totals,
  };
}

module.exports = {
  getSalesPerformance,
  getPipelineForecast,
  getLeadSourceRoi,
  getActivitySummary,
  STAGE_PROBABILITY,
};
