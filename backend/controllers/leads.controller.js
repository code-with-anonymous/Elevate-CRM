'use strict';

const Lead = require('../models/Lead');
const Task = require('../models/Task');
const User = require('../models/User');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

// GET /api/leads
const getLeads = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = {
    organizationId: req.organizationId,
    isDeleted: { $ne: true },
  };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.source) {
    filter.source = req.query.source;
  }

  if (req.query.assignedTo) {
    filter.assignedTo = req.query.assignedTo;
  }

  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, 'i');
    filter.$or = [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { email: searchRegex },
      { company: searchRegex },
    ];
  }

  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
  const sortOptions = { [sortBy]: sortOrder };

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .populate('assignedTo', 'firstName lastName email avatarUrl'),
    Lead.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return ApiResponse.ok(res, 'Leads fetched successfully', {
    leads,
    total,
    page,
    totalPages,
  });
});

// POST /api/leads
const createLead = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    company,
    source,
    value,
    assignedTo,
    status,
    notes,
    tags,
  } = req.body;

  if (!firstName || !lastName) {
    throw ApiError.badRequest('First name and last name are required');
  }

  const initialStatus = status || 'New';
  const now = new Date();

  const lead = await Lead.create({
    organizationId: req.organizationId,
    firstName,
    lastName,
    email: email || null,
    phone: phone || null,
    company: company || null,
    source: source || 'Other',
    value: value || 0,
    assignedTo: assignedTo || null,
    status: initialStatus,
    notes: notes || null,
    tags: tags || [],
    statusChangedAt: now,
    activityLog: [{ status: initialStatus, changedAt: now, note: 'Lead created' }],
  });

  const populatedLead = await Lead.findById(lead._id).populate(
    'assignedTo',
    'firstName lastName email avatarUrl'
  );

  return ApiResponse.created(res, 'Lead created successfully', populatedLead);
});

// GET /api/leads/:id
const getLeadById = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    organizationId: req.organizationId,
    isDeleted: { $ne: true },
  }).populate('assignedTo', 'firstName lastName email avatarUrl');

  if (!lead) {
    throw ApiError.notFound('Lead not found');
  }

  // Fetch related tasks
  const tasks = await Task.find({
    organizationId: req.organizationId,
    relatedTo: lead._id,
  })
    .sort({ dueDate: 1 })
    .populate('assignedTo', 'firstName lastName');

  return ApiResponse.ok(res, 'Lead details fetched', {
    lead,
    tasks,
  });
});

// PATCH /api/leads/:id
const updateLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    organizationId: req.organizationId,
    isDeleted: { $ne: true },
  });

  if (!lead) {
    throw ApiError.notFound('Lead not found');
  }

  const allowedFields = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'company',
    'source',
    'value',
    'notes',
    'tags',
    'assignedTo',
    'status',
  ];

  let statusChanged = false;
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (field === 'status' && req.body.status !== lead.status) {
        statusChanged = true;
      }
      lead[field] = req.body[field];
    }
  });

  if (statusChanged) {
    lead.statusChangedAt = new Date();
    lead.activityLog.push({
      status: lead.status,
      changedAt: lead.statusChangedAt,
      note: `Status updated to ${lead.status}`,
    });
  }

  await lead.save();

  const updatedLead = await Lead.findById(lead._id).populate(
    'assignedTo',
    'firstName lastName email avatarUrl'
  );

  return ApiResponse.ok(res, 'Lead updated successfully', updatedLead);
});

// DELETE /api/leads/:id (Soft delete)
const deleteLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    organizationId: req.organizationId,
    isDeleted: { $ne: true },
  });

  if (!lead) {
    throw ApiError.notFound('Lead not found');
  }

  lead.isDeleted = true;
  await lead.save();

  return ApiResponse.ok(res, 'Lead deleted successfully', { id: lead._id });
});

// PATCH /api/leads/:id/status
const updateLeadStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) {
    throw ApiError.badRequest('Status is required');
  }

  const lead = await Lead.findOne({
    _id: req.params.id,
    organizationId: req.organizationId,
    isDeleted: { $ne: true },
  });

  if (!lead) {
    throw ApiError.notFound('Lead not found');
  }

  if (lead.status !== status) {
    lead.status = status;
    lead.statusChangedAt = new Date();
    lead.activityLog.push({
      status,
      changedAt: lead.statusChangedAt,
      note: `Status moved to ${status}`,
    });
    await lead.save();
  }

  const updatedLead = await Lead.findById(lead._id).populate(
    'assignedTo',
    'firstName lastName email avatarUrl'
  );

  return ApiResponse.ok(res, 'Lead status updated successfully', updatedLead);
});

// GET /api/leads/users
const getOrgUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ organizationId: req.organizationId }).select(
    'firstName lastName email avatarUrl'
  );
  return ApiResponse.ok(res, 'Organization users fetched successfully', users);
});

module.exports = {
  getLeads,
  createLead,
  getLeadById,
  updateLead,
  deleteLead,
  updateLeadStatus,
  getOrgUsers,
};
