// ─────────────────────────────────────────────────────────────────────────────
// controllers/tasks.controller.js
// Full CRUD for Tasks — all queries tenant-scoped
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const Task = require('../models/Task');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const getOrgId = (req) => req.organizationId || req.user?.organizationId;

// ── GET /api/tasks ────────────────────────────────────────────────────────────

exports.getTasks = catchAsync(async (req, res) => {
  const orgId = getOrgId(req);

  const {
    status,
    priority,
    assignedTo,
    relatedTo,
    overdue,
    search,
    page = 1,
    limit = 50,
    sort = 'dueDate',
  } = req.query;

  const filter = { organizationId: orgId };

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (relatedTo) filter.relatedTo = relatedTo;

  if (overdue === 'true') {
    filter.dueDate = { $lt: new Date() };
    filter.status = { $ne: 'Done' };
  }

  if (search) {
    filter.title = { $regex: search, $options: 'i' };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Task.countDocuments(filter);
  const tasks = await Task.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(Number(limit))
    .populate('assignedTo', 'firstName lastName email avatarUrl')
    .populate('relatedTo', 'firstName lastName title company');

  res.status(200).json({
    success: true,
    data: { tasks, total, page: Number(page), limit: Number(limit) },
  });
});

// ── GET /api/tasks/:id ────────────────────────────────────────────────────────

exports.getTask = catchAsync(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    organizationId: getOrgId(req),
  })
    .populate('assignedTo', 'firstName lastName email avatarUrl')
    .populate('relatedTo', 'firstName lastName title company');

  if (!task) throw new ApiError('Task not found', 404);

  res.status(200).json({ success: true, data: task });
});

// ── POST /api/tasks ───────────────────────────────────────────────────────────

exports.createTask = catchAsync(async (req, res) => {
  const {
    title,
    description,
    assignedTo,
    relatedTo,
    relatedModel,
    priority,
    status,
    dueDate,
  } = req.body;

  if (!title) throw new ApiError('Task title is required', 400);

  const task = await Task.create({
    organizationId: getOrgId(req),
    title,
    description: description || null,
    assignedTo: assignedTo || null,
    relatedTo: relatedTo || null,
    relatedModel: relatedModel || null,
    priority: priority || 'Medium',
    status: status || 'Open',
    dueDate: dueDate ? new Date(dueDate) : null,
    completedAt: status === 'Done' ? new Date() : null,
  });

  const populated = await Task.findById(task._id)
    .populate('assignedTo', 'firstName lastName email avatarUrl')
    .populate('relatedTo', 'firstName lastName title company');

  res.status(201).json({ success: true, data: populated });
});

// ── PATCH /api/tasks/:id ──────────────────────────────────────────────────────

exports.updateTask = catchAsync(async (req, res) => {
  const allowedFields = [
    'title',
    'description',
    'assignedTo',
    'relatedTo',
    'relatedModel',
    'priority',
    'status',
    'dueDate',
  ];

  const updates = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const task = await Task.findOne({
    _id: req.params.id,
    organizationId: getOrgId(req),
  });

  if (!task) throw new ApiError('Task not found', 404);

  Object.assign(task, updates);

  if (updates.status === 'Done' && !task.completedAt) {
    task.completedAt = new Date();
  } else if (updates.status && updates.status !== 'Done') {
    task.completedAt = null;
  }

  await task.save();

  const updated = await Task.findById(task._id)
    .populate('assignedTo', 'firstName lastName email avatarUrl')
    .populate('relatedTo', 'firstName lastName title company');

  res.status(200).json({ success: true, data: updated });
});

// ── PATCH /api/tasks/:id/complete ─────────────────────────────────────────────

exports.completeTask = catchAsync(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    organizationId: getOrgId(req),
  });

  if (!task) throw new ApiError('Task not found', 404);

  task.status = 'Done';
  task.completedAt = new Date();
  await task.save();

  const updated = await Task.findById(task._id)
    .populate('assignedTo', 'firstName lastName email avatarUrl')
    .populate('relatedTo', 'firstName lastName title company');

  res.status(200).json({ success: true, data: updated });
});

// ── DELETE /api/tasks/:id ─────────────────────────────────────────────────────

exports.deleteTask = catchAsync(async (req, res) => {
  const task = await Task.findOneAndDelete({
    _id: req.params.id,
    organizationId: getOrgId(req),
  });

  if (!task) throw new ApiError('Task not found', 404);

  res.status(200).json({ success: true, message: 'Task deleted' });
});
