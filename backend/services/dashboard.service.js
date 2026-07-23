// ─────────────────────────────────────────────────────────────────────────────
// services/dashboard.service.js — ALL dashboard aggregation logic
// No req/res here. Every function receives organizationId (ObjectId or string).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');
const Lead     = require('../models/Lead');
const Deal     = require('../models/Deal');
const Task     = require('../models/Task');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Ensure organizationId is a Mongoose ObjectId */
function toObjId(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/** Return the start of the current day (midnight UTC) */
function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Return the start of the current ISO week (Monday 00:00 UTC) */
function startOfWeek(offsetWeeks = 0) {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun, 1=Mon …
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diffToMonday + offsetWeeks * 7);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Return the first moment of the current year */
function startOfYear() {
  return new Date(new Date().getUTCFullYear(), 0, 1);
}

/** Return N months ago from now */
function monthsAgo(n) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Deterministic avatar color from name.
 * Hashes firstName+lastName to one of 8 preset colors.
 */
function avatarColor(firstName = '', lastName = '') {
  const palette = [
    '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
    '#10B981', '#EF4444', '#06B6D4', '#F97316',
  ];
  const str  = `${firstName}${lastName}`;
  let hash   = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

/** Derive task type from title keywords */
function deriveTaskType(title = '') {
  const lower = title.toLowerCase();
  if (lower.includes('call') || lower.includes('phone')) return 'call';
  if (lower.includes('doc') || lower.includes('send') || lower.includes('proposal')) return 'document';
  return 'task';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. getStats — single parallel call returning all KPI numbers
// ─────────────────────────────────────────────────────────────────────────────
async function getStats(organizationId, dateRange = {}) {
  const orgId = toObjId(organizationId);

  const thisWeekStart  = startOfWeek(0);
  const lastWeekStart  = startOfWeek(-1);

  // Optional date range filter (from Phase 4 – date range picker)
  const dateFilter = {};
  if (dateRange.from) dateFilter.$gte = new Date(dateRange.from);
  if (dateRange.to)   dateFilter.$lte = new Date(dateRange.to);
  const createdAtFilter = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

  const [
    pipelineResult,
    weeklyResult,
    lastWeekResult,
    totalLeads,
    wonLeads,
    openTaskCount,
  ] = await Promise.all([
    // [1] Pipeline value — all active (not Won / Lost)
    Lead.aggregate([
      { $match: { organizationId: orgId, status: { $nin: ['Won', 'Lost'] }, ...createdAtFilter } },
      { $group: { _id: null, total: { $sum: '$value' } } },
    ]),

    // [2a] This week's closed-won deals
    Deal.aggregate([
      { $match: { organizationId: orgId, stage: 'Won', closedAt: { $gte: thisWeekStart } } },
      { $group: { _id: null, total: { $sum: '$value' } } },
    ]),

    // [2b] Last week's closed-won deals
    Deal.aggregate([
      {
        $match: {
          organizationId: orgId,
          stage: 'Won',
          closedAt: { $gte: lastWeekStart, $lt: thisWeekStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$value' } } },
    ]),

    // [3a] Total lead count
    Lead.countDocuments({ organizationId: orgId, ...createdAtFilter }),

    // [3b] Won lead count
    Lead.countDocuments({ organizationId: orgId, status: 'Won', ...createdAtFilter }),

    // [4] Open task count
    Task.countDocuments({ organizationId: orgId, status: { $ne: 'Done' } }),
  ]);

  const pipelineValue = pipelineResult[0]?.total ?? 0;
  const thisWeek      = weeklyResult[0]?.total   ?? 0;
  const lastWeek      = lastWeekResult[0]?.total  ?? 0;

  const delta = lastWeek === 0
    ? (thisWeek > 0 ? 100 : 0)
    : parseFloat((((thisWeek - lastWeek) / lastWeek) * 100).toFixed(1));

  const rate = totalLeads === 0
    ? 0
    : parseFloat(((wonLeads / totalLeads) * 100).toFixed(1));

  return {
    pipelineValue,
    weeklyRevenue: { amount: thisWeek, delta },
    conversion:    { rate, totalLeads, openTasks: openTaskCount },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. getPipelineChart — leads created per month / per year
// ─────────────────────────────────────────────────────────────────────────────
async function getPipelineChart(organizationId, period = 'monthly', dateRange = {}) {
  const orgId = toObjId(organizationId);

  if (period === 'annually') {
    // Last 5 years
    const fiveYearsAgo = new Date(new Date().getUTCFullYear() - 4, 0, 1);
    const rows = await Lead.aggregate([
      { $match: { organizationId: orgId, createdAt: { $gte: fiveYearsAgo } } },
      { $group: { _id: { year: { $year: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1 } },
    ]);

    const currentYear = new Date().getUTCFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);
    const data = years.map(yr => {
      const row = rows.find(r => r._id.year === yr);
      return { label: String(yr), value: row?.count ?? 0 };
    });

    const maxVal   = Math.max(...data.map(d => d.value), 0);
    const peakItem = data.find(d => d.value === maxVal);

    return { period, data, peakMonth: peakItem?.label ?? null, peakGrowth: null };
  }

  // Monthly — current year
  const yrStart = startOfYear();
  const dateFilter = {};
  if (dateRange.from) dateFilter.$gte = new Date(dateRange.from);
  if (dateRange.to)   dateFilter.$lte = new Date(dateRange.to);
  const matchFilter = Object.keys(dateFilter).length
    ? { organizationId: orgId, createdAt: dateFilter }
    : { organizationId: orgId, createdAt: { $gte: yrStart } };

  const rows = await Lead.aggregate([
    { $match: matchFilter },
    { $group: { _id: { month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { '_id.month': 1 } },
  ]);

  // Fill all 12 months
  const data = Array.from({ length: 12 }, (_, i) => {
    const row = rows.find(r => r._id.month === i + 1);
    return { label: MONTH_LABELS[i], value: row?.count ?? 0 };
  });

  // Peak month + growth vs previous month
  let peakIdx   = 0;
  let peakValue = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i].value > peakValue) { peakValue = data[i].value; peakIdx = i; }
  }
  const prevValue  = peakIdx > 0 ? data[peakIdx - 1].value : 0;
  const peakGrowth = prevValue === 0
    ? null
    : parseFloat((((peakValue - prevValue) / prevValue) * 100).toFixed(1));

  return {
    period,
    data,
    peakMonth:  peakValue > 0 ? data[peakIdx].label : null,
    peakGrowth,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. getLeadActivity — most recent lead status changes (last 20)
// ─────────────────────────────────────────────────────────────────────────────
async function getLeadActivity(organizationId) {
  const orgId = toObjId(organizationId);

  const leads = await Lead.find({ organizationId: orgId })
    .sort({ statusChangedAt: -1 })
    .limit(20)
    .populate('assignedTo', 'firstName lastName avatarUrl')
    .select('firstName lastName company status value statusChangedAt source');

  const activities = leads.map(lead => {
    const changed = lead.statusChangedAt || lead.updatedAt;
    const dateObj  = new Date(changed);
    return {
      id:          lead._id.toString(),
      fullName:    `${lead.firstName} ${lead.lastName}`,
      company:     lead.company || '—',
      status:      lead.status,
      value:       lead.value,
      source:      lead.source,
      date:        dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      time:        dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      initials:    `${lead.firstName.charAt(0)}${lead.lastName.charAt(0)}`.toUpperCase(),
      avatarColor: avatarColor(lead.firstName, lead.lastName),
      assignee:    lead.assignedTo
        ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}`
        : null,
    };
  });

  return { activities };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. getFollowUps — upcoming tasks, sorted by urgency (dueDate ASC)
// ─────────────────────────────────────────────────────────────────────────────
async function getFollowUps(organizationId) {
  const orgId = toObjId(organizationId);
  const now   = new Date();

  const tasks = await Task.find({
    organizationId: orgId,
    status:  { $ne: 'Done' },
    dueDate: { $gte: now },
  })
    .sort({ dueDate: 1 })
    .limit(5)
    .populate('assignedTo', 'firstName lastName')
    .populate('relatedTo', 'firstName lastName company title');

  const followUps = tasks.map(task => {
    const due = task.dueDate;
    return {
      id:          task._id.toString(),
      title:       task.title,
      description: task.description,
      dueDate:     due
        ? due.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
        : null,
      dueDateRaw:  due ? due.toISOString() : null,
      priority:    task.priority,
      status:      task.status,
      assignee:    task.assignedTo
        ? { name: `${task.assignedTo.firstName} ${task.assignedTo.lastName}` }
        : null,
      relatedName: task.relatedTo
        ? (task.relatedTo.title || `${task.relatedTo.firstName || ''} ${task.relatedTo.lastName || ''}`.trim() || null)
        : null,
      type: deriveTaskType(task.title),
    };
  });

  return { followUps };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. getLeadsBySource — leads grouped by source
// ─────────────────────────────────────────────────────────────────────────────
async function getLeadsBySource(organizationId, dateRange = {}) {
  const orgId = toObjId(organizationId);

  const dateFilter = {};
  if (dateRange.from) dateFilter.$gte = new Date(dateRange.from);
  if (dateRange.to)   dateFilter.$lte = new Date(dateRange.to);
  const createdAtFilter = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

  const rows = await Lead.aggregate([
    { $match: { organizationId: orgId, ...createdAtFilter } },
    { $group: { _id: '$source', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const sources = rows.map(r => ({
    source:     r._id || 'Unknown',
    count:      r.count,
    percentage: total > 0 ? parseFloat(((r.count / total) * 100).toFixed(1)) : 0,
  }));

  return { total, sources };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. getRevenueTrend — 6-month cumulative closed-won revenue for area chart
// ─────────────────────────────────────────────────────────────────────────────
async function getRevenueTrend(organizationId, dateRange = {}) {
  const orgId       = toObjId(organizationId);
  const sixMonthAgo = monthsAgo(6);

  const dateFilter = {};
  if (dateRange.from) dateFilter.$gte = new Date(dateRange.from);
  if (dateRange.to)   dateFilter.$lte = new Date(dateRange.to);
  const closedFilter = Object.keys(dateFilter).length
    ? dateFilter
    : { $gte: sixMonthAgo };

  const rows = await Deal.aggregate([
    { $match: { organizationId: orgId, stage: 'Won', closedAt: closedFilter } },
    {
      $group: {
        _id:     { month: { $month: '$closedAt' }, year: { $year: '$closedAt' } },
        revenue: { $sum: '$value' },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  // Build last-6-months array with zero-fill
  const now = new Date();
  const trend = Array.from({ length: 6 }, (_, i) => {
    const d   = new Date(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1);
    const mon = d.getMonth() + 1; // 1-based
    const yr  = d.getFullYear();
    const row = rows.find(r => r._id.month === mon && r._id.year === yr);
    return { label: MONTH_LABELS[d.getMonth()], value: row?.revenue ?? 0 };
  });

  const totalWon = await Deal.aggregate([
    { $match: { organizationId: orgId, stage: 'Won' } },
    { $group: { _id: null, total: { $sum: '$value' } } },
  ]);

  return {
    totalWon: totalWon[0]?.total ?? 0,
    trend,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. getAIInsights — internal aggregation, structured insight objects
//    (Real Gemini integration comes in a later phase)
// ─────────────────────────────────────────────────────────────────────────────
async function getAIInsights(organizationId) {
  const orgId     = toObjId(organizationId);
  const now       = new Date();
  const thisMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const lastMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

  const [
    pipelineResult,
    totalLeads,
    wonLeads,
    wonThisMonth,
    wonLastMonth,
    topSourceResult,
    stalledLeads,
    oldestOpenLead,
  ] = await Promise.all([
    // Total pipeline value
    Lead.aggregate([
      { $match: { organizationId: orgId, status: { $nin: ['Won', 'Lost'] } } },
      { $group: { _id: null, total: { $sum: '$value' } } },
    ]),

    // Total leads
    Lead.countDocuments({ organizationId: orgId }),

    // Won leads (all time)
    Lead.countDocuments({ organizationId: orgId, status: 'Won' }),

    // Won this month
    Lead.countDocuments({
      organizationId: orgId,
      status:         'Won',
      statusChangedAt: { $gte: thisMonthStart },
    }),

    // Won last month
    Lead.countDocuments({
      organizationId: orgId,
      status:         'Won',
      statusChangedAt: { $gte: lastMonthStart, $lt: thisMonthStart },
    }),

    // Top source this month
    Lead.aggregate([
      { $match: { organizationId: orgId, createdAt: { $gte: thisMonthStart } } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]),

    // Stalled in Qualified for 14+ days
    Lead.countDocuments({
      organizationId:  orgId,
      status:          'Qualified',
      statusChangedAt: { $lte: fourteenDaysAgo },
    }),

    // Oldest open lead
    Lead.findOne({
      organizationId: orgId,
      status: { $nin: ['Won', 'Lost'] },
    })
      .sort({ createdAt: 1 })
      .select('createdAt'),
  ]);

  const pipelineValue = pipelineResult[0]?.total ?? 0;
  const winRate       = totalLeads > 0
    ? parseFloat(((wonLeads / totalLeads) * 100).toFixed(1))
    : 0;

  const wonDelta = wonLastMonth === 0
    ? (wonThisMonth > 0 ? 100 : 0)
    : parseFloat((((wonThisMonth - wonLastMonth) / wonLastMonth) * 100).toFixed(1));

  const topSource     = topSourceResult[0]?._id ?? null;
  const topSourceCount = topSourceResult[0]?.count ?? 0;

  const pipelineFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 1, notation: 'compact' }).format(pipelineValue);

  // Days oldest lead has been open
  let oldestDays = null;
  if (oldestOpenLead) {
    oldestDays = Math.floor((now - new Date(oldestOpenLead.createdAt)) / (1000 * 60 * 60 * 24));
  }

  const insights = [];

  // Positive: pipeline value
  insights.push({
    type: 'info',
    text: `Your pipeline has ${pipelineFmt} in active deals.`,
  });

  // Win rate
  if (wonDelta >= 0) {
    insights.push({
      type: 'positive',
      text: `Win rate is ${winRate}% — up ${wonDelta}% in monthly won leads vs last month.`,
    });
  } else {
    insights.push({
      type: 'warning',
      text: `Win rate is ${winRate}% — down ${Math.abs(wonDelta)}% vs last month. Consider reviewing your pipeline.`,
    });
  }

  // Top source
  if (topSource) {
    insights.push({
      type: 'positive',
      text: `${topSource} is your top lead source this month with ${topSourceCount} new lead${topSourceCount !== 1 ? 's' : ''}.`,
    });
  }

  // Stalled leads
  if (stalledLeads > 0) {
    insights.push({
      type: 'warning',
      text: `${stalledLeads} lead${stalledLeads !== 1 ? 's' : ''} stalled in "Qualified" for 14+ days — consider following up.`,
    });
  }

  // Oldest open lead
  if (oldestDays !== null && oldestDays > 30) {
    insights.push({
      type: 'warning',
      text: `Your oldest open lead has been in the pipeline for ${oldestDays} days without closing.`,
    });
  }

  return {
    insights,
    generatedAt:     now.toISOString(),
    pipelineSummary: {
      value:     pipelineValue,
      winRate,
      topSource: topSource || 'N/A',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getStats,
  getPipelineChart,
  getLeadActivity,
  getFollowUps,
  getLeadsBySource,
  getRevenueTrend,
  getAIInsights,
};
