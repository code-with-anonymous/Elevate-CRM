// ─────────────────────────────────────────────────────────────────────────────
// controllers/deals.controller.js
// Full CRUD + stage-move for the pipeline kanban
// All queries are scoped to req.user.organizationId
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const Deal        = require('../models/Deal');
const Contact     = require('../models/Contact');
const ApiError = require('../utils/ApiError');
const catchAsync  = require('../utils/catchAsync');

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_STAGES = ['Lead', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'];

const getOrgId = (req) => req.organizationId || req.user?.organizationId;

// ── GET /api/deals  (list, scoped) ───────────────────────────────────────────

exports.getDeals = catchAsync(async (req, res) => {
  const orgId = getOrgId(req);

  const {
    stage,
    assignedTo,
    search,
    page  = 1,
    limit = 100,   // kanban usually shows all; keep limit high
    sort  = '-createdAt',
  } = req.query;

  const filter = { organizationId: orgId };

  if (stage)      filter.stage      = stage;
  if (assignedTo) filter.assignedTo = assignedTo;

  if (search) {
    filter.title = { $regex: search, $options: 'i' };
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Deal.countDocuments(filter);
  const deals = await Deal.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(Number(limit))
    .populate('assignedTo', 'firstName lastName email')
    .populate('leadId',     'firstName lastName company');

  res.status(200).json({
    success: true,
    data: { deals, total, page: Number(page), limit: Number(limit) },
  });
});

// ── GET /api/deals/:id ────────────────────────────────────────────────────────

exports.getDeal = catchAsync(async (req, res) => {
  const deal = await Deal.findOne({
    _id:            req.params.id,
    organizationId: getOrgId(req),
  })
    .populate('assignedTo', 'firstName lastName email')
    .populate('leadId',     'firstName lastName company');

  if (!deal) throw new ApiError('Deal not found', 404);

  res.status(200).json({ success: true, data: deal });
});

// ── POST /api/deals ───────────────────────────────────────────────────────────

exports.createDeal = catchAsync(async (req, res) => {
  const { title, value, stage, expectedCloseDate, currency, assignedTo, leadId } = req.body;

  const deal = await Deal.create({
    organizationId: getOrgId(req),
    title,
    value,
    stage:              stage || 'Lead',
    expectedCloseDate:  expectedCloseDate || null,
    currency:           currency || 'USD',
    assignedTo:         assignedTo || null,
    leadId:             leadId     || null,
  });

  res.status(201).json({ success: true, data: deal });
});

// ── PATCH /api/deals/:id ──────────────────────────────────────────────────────

exports.updateDeal = catchAsync(async (req, res) => {
  const allowedFields = ['title', 'value', 'stage', 'expectedCloseDate', 'currency', 'assignedTo', 'leadId'];
  const updates = {};

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  if (updates.stage && !VALID_STAGES.includes(updates.stage)) {
    throw new ApiError(`Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}`, 400);
  }

  const deal = await Deal.findOneAndUpdate(
    { _id: req.params.id, organizationId: getOrgId(req) },
    updates,
    { new: true, runValidators: true }
  )
    .populate('assignedTo', 'firstName lastName email')
    .populate('leadId',     'firstName lastName company');

  if (!deal) throw new ApiError('Deal not found', 404);

  res.status(200).json({ success: true, data: deal });
});

// ── PATCH /api/deals/:id/stage  (optimistic drag-drop endpoint) ───────────────

exports.moveDealStage = catchAsync(async (req, res) => {
  const { stage } = req.body;

  if (!stage || !VALID_STAGES.includes(stage)) {
    throw new ApiError(`Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}`, 400);
  }

  // Use findOne + save so the pre-save hook fires (sets closedAt)
  const deal = await Deal.findOne({
    _id:            req.params.id,
    organizationId: getOrgId(req),
  });

  if (!deal) throw new ApiError('Deal not found', 404);

  deal.stage = stage;
  await deal.save();

  // ── Auto-create a Contact when a deal is first moved to Won ──────────────
  if (stage === 'Won') {
    const existing = await Contact.findOne({
      organizationId: deal.organizationId,
      dealId:         deal._id,
    });

    if (!existing) {
      // Populate leadId if it exists to grab name / company
      await deal.populate('leadId', 'firstName lastName company email phone');

      const lead = deal.leadId;
      await Contact.create({
        organizationId: deal.organizationId,
        dealId:         deal._id,
        leadId:         lead ? lead._id : null,
        assignedTo:     deal.assignedTo || null,
        firstName:      lead ? lead.firstName : deal.title,
        lastName:       lead ? lead.lastName  : '',
        email:          lead ? lead.email      : null,
        phone:          lead ? lead.phone      : null,
        company:        lead ? lead.company    : null,
        status:         'active',
        notes:          `Auto-created from won deal: ${deal.title}`,
      });
    }
  }

  res.status(200).json({ success: true, data: deal });
});

// ── DELETE /api/deals/:id ─────────────────────────────────────────────────────

exports.deleteDeal = catchAsync(async (req, res) => {
  const deal = await Deal.findOneAndDelete({
    _id:            req.params.id,
    organizationId: getOrgId(req),
  });

  if (!deal) throw new ApiError('Deal not found', 404);

  res.status(200).json({ success: true, message: 'Deal deleted' });
});
