// ─────────────────────────────────────────────────────────────────────────────
// controllers/activity.controller.js — organisation-wide activity feed
//
// THIS one earns $unionWith, where Calendar didn't. The difference: Calendar
// fetches two small sets and reshapes them, so two parallel finds were simpler.
// Here we need a single stream sorted by time and paginated ACROSS four
// collections — merging in JS would mean fetching every event in the org to
// return page 3. The database has to do the sort.
//
// No audit table exists, and this deliberately doesn't create one. The feed is
// derived from timestamps the app already writes:
//   · Lead.activityLog[]  — status transitions, already recorded per lead
//   · Task.completedAt    — stamped by the pre-save hook
//   · Deal.closedAt       — stamped by the pre-save hook
//   · User.createdAt      — someone joined the organisation
//
// The cost of deriving rather than logging: only these four things are
// observable. Edits, deletes, and role changes leave no trace, because nothing
// writes one. Fixing that means a real Activity collection and a write on every
// mutation — a bigger change than this endpoint.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const ACTIVITY_TYPES = ['lead', 'task', 'deal', 'member'];

const MAX_LIMIT = 100;

function toObjId(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

// ── GET /api/activity-log?page=&limit=&type= ──────────────────────────────────
const getActivityLog = asyncHandler(async (req, res) => {
  const orgId = toObjId(req.organizationId);

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const skip = (page - 1) * limit;

  const type = req.query.type ? String(req.query.type).toLowerCase() : null;
  if (type && !ACTIVITY_TYPES.includes(type)) {
    throw ApiError.badRequest(
      `type must be one of: ${ACTIVITY_TYPES.join(', ')}`,
      'INVALID_TYPE'
    );
  }

  // Every branch projects to the SAME shape. Union branches with mismatched
  // fields don't error — they just produce rows with holes, which surface as
  // blank timeline entries rather than as a failure.
  const shape = {
    _id: 0,
    type: 1,
    action: 1,
    subject: 1,
    note: 1,
    at: 1,
    actorId: 1,
    entityId: 1,
    entityType: 1,
  };

  // Leads contribute from TWO mutually-exclusive sources, because the two are
  // populated by different paths:
  //
  //   · activityLog[]   — pushed by updateLeadStatus on every transition, so it
  //                       carries the full history. Only exists for leads that
  //                       moved through the API.
  //   · statusChangedAt — a single timestamp maintained by the pre-save hook,
  //                       and set explicitly by the seeder. Always present.
  //
  // `insertMany` skips pre-save hooks and the seeder doesn't write activityLog,
  // so every seeded lead has statusChangedAt and an empty log. Using only the
  // log (as this first did) made the feed silently lead-free on demo data.
  //
  // The two branches partition on `activityLog.0` existing, so no lead is
  // counted twice.
  const leadHistoryBranch = [
    {
      $match: {
        organizationId: orgId,
        isDeleted: { $ne: true },
        'activityLog.0': { $exists: true },
      },
    },
    { $unwind: '$activityLog' },
    {
      $project: {
        ...shape,
        type: 'lead',
        action: { $concat: ['moved to ', { $ifNull: ['$activityLog.status', 'unknown'] }] },
        subject: { $concat: ['$firstName', ' ', '$lastName'] },
        note: '$activityLog.note',
        at: '$activityLog.changedAt',
        actorId: '$assignedTo',
        entityId: '$_id',
        entityType: 'Lead',
      },
    },
  ];

  const leadFallbackBranch = [
    {
      $match: {
        organizationId: orgId,
        isDeleted: { $ne: true },
        'activityLog.0': { $exists: false },
        statusChangedAt: { $ne: null },
      },
    },
    {
      $project: {
        ...shape,
        type: 'lead',
        // Present tense, not "moved to": one timestamp only tells us the lead is
        // AT this status, not that we witnessed the transition.
        action: { $concat: ['is at ', { $ifNull: ['$status', 'unknown'] }] },
        subject: { $concat: ['$firstName', ' ', '$lastName'] },
        note: '$company',
        at: '$statusChangedAt',
        actorId: '$assignedTo',
        entityId: '$_id',
        entityType: 'Lead',
      },
    },
  ];

  const taskBranch = [
    // completedAt is null until a task is ticked, so this match is also the
    // "only completed tasks" filter.
    { $match: { organizationId: orgId, completedAt: { $ne: null } } },
    {
      $project: {
        ...shape,
        type: 'task',
        action: 'completed a task',
        subject: '$title',
        note: '$description',
        at: '$completedAt',
        actorId: '$assignedTo',
        entityId: '$_id',
        entityType: 'Task',
      },
    },
  ];

  const dealBranch = [
    { $match: { organizationId: orgId, closedAt: { $ne: null } } },
    {
      $project: {
        ...shape,
        type: 'deal',
        // Won and Lost both stamp closedAt, so the stage decides the verb.
        action: {
          $cond: [{ $eq: ['$stage', 'Won'] }, 'won a deal', 'lost a deal'],
        },
        subject: '$title',
        note: null,
        at: '$closedAt',
        actorId: '$assignedTo',
        entityId: '$_id',
        entityType: 'Deal',
      },
    },
  ];

  const memberBranch = [
    { $match: { organizationId: orgId } },
    {
      $project: {
        ...shape,
        type: 'member',
        action: 'joined the organisation',
        subject: { $concat: ['$firstName', ' ', '$lastName'] },
        note: '$role',
        at: '$createdAt',
        // The actor IS the subject here — someone joining isn't done *to* them
        // by anyone the data records.
        actorId: '$_id',
        entityId: '$_id',
        entityType: 'User',
      },
    },
  ];

  // Branch order is irrelevant to the result — the $sort after the union is
  // what orders the feed — but the base collection must be the one whose
  // pipeline runs first, so `lead` leads.
  const pipeline = [
    ...leadHistoryBranch,
    // $unionWith can target the collection it's already reading — that's how the
    // second lead branch joins the same stream.
    { $unionWith: { coll: 'leads', pipeline: leadFallbackBranch } },
    { $unionWith: { coll: 'tasks', pipeline: taskBranch } },
    { $unionWith: { coll: 'deals', pipeline: dealBranch } },
    { $unionWith: { coll: 'users', pipeline: memberBranch } },
    // Drop rows with no timestamp — a lead whose activityLog entry predates the
    // changedAt default would otherwise sort to the end of time.
    { $match: { at: { $ne: null } } },
    ...(type ? [{ $match: { type } }] : []),
    { $sort: { at: -1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await Lead.aggregate(pipeline);
  const rows = result?.rows ?? [];
  const total = result?.total?.[0]?.count ?? 0;

  // Actor names are resolved AFTER pagination — one query for the ≤25 distinct
  // actors on this page, instead of a $lookup against every row in the union.
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean).map(String))];
  const actors = actorIds.length
    ? await User.find({ _id: { $in: actorIds }, organizationId: orgId })
        .select('firstName lastName avatarUrl')
        .lean()
    : [];
  const actorById = new Map(actors.map((a) => [String(a._id), a]));

  return ApiResponse.ok(res, 'Activity log', {
    activities: rows.map((row) => {
      const actor = row.actorId ? actorById.get(String(row.actorId)) : null;
      return {
        // No stable id exists — these rows are derived, not stored. A composite
        // key keeps React's reconciliation happy without pretending otherwise.
        id: `${row.type}-${row.entityId}-${new Date(row.at).getTime()}`,
        type: row.type,
        action: row.action,
        subject: row.subject,
        note: row.note || null,
        at: row.at,
        entityId: row.entityId ? String(row.entityId) : null,
        entityType: row.entityType,
        actor: actor
          ? {
              id: String(actor._id),
              firstName: actor.firstName,
              lastName: actor.lastName,
              avatarUrl: actor.avatarUrl || null,
            }
          : null,
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    types: ACTIVITY_TYPES,
  });
});

module.exports = { getActivityLog, ACTIVITY_TYPES };
