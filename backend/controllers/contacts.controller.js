// ─────────────────────────────────────────────────────────────────────────────
// controllers/contacts.controller.js
// Full CRUD for Contacts — all queries org-scoped, soft-delete supported
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const Contact    = require('../models/Contact');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const getOrgId = (req) => req.organizationId || req.user?.organizationId;

// ── GET /api/contacts ─────────────────────────────────────────────────────────

exports.getContacts = catchAsync(async (req, res) => {
  const orgId = getOrgId(req);

  const {
    status,
    company,
    assignedTo,
    search,
    tags,
    page  = 1,
    limit = 20,
    sort  = '-createdAt',
  } = req.query;

  const filter = { organizationId: orgId, isDeleted: false };

  if (status)     filter.status     = status;
  if (company)    filter.company    = { $regex: company, $options: 'i' };
  if (assignedTo) filter.assignedTo = assignedTo;
  if (tags)       filter.tags       = { $in: Array.isArray(tags) ? tags : [tags] };

  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName:  { $regex: search, $options: 'i' } },
      { email:     { $regex: search, $options: 'i' } },
      { company:   { $regex: search, $options: 'i' } },
    ];
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Contact.countDocuments(filter);
  const contacts = await Contact.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(Number(limit))
    .populate('assignedTo', 'firstName lastName email')
    .populate('leadId',     'firstName lastName')
    .populate('dealId',     'title stage');

  res.status(200).json({
    success: true,
    data: { contacts, total, page: Number(page), limit: Number(limit) },
  });
});

// ── GET /api/contacts/:id ─────────────────────────────────────────────────────

exports.getContact = catchAsync(async (req, res) => {
  const contact = await Contact.findOne({
    _id:            req.params.id,
    organizationId: getOrgId(req),
    isDeleted:      false,
  })
    .populate('assignedTo', 'firstName lastName email')
    .populate('leadId',     'firstName lastName company')
    .populate('dealId',     'title stage value');

  if (!contact) throw new ApiError('Contact not found', 404);

  res.status(200).json({ success: true, data: contact });
});

// ── POST /api/contacts ────────────────────────────────────────────────────────

exports.createContact = catchAsync(async (req, res) => {
  const {
    firstName, lastName, email, phone, company, jobTitle,
    avatarUrl, address, status, notes, tags, assignedTo, leadId, dealId,
  } = req.body;

  const contact = await Contact.create({
    organizationId: getOrgId(req),
    firstName,
    lastName:   lastName   ?? '',
    email:      email      ?? null,
    phone:      phone      ?? null,
    company:    company    ?? null,
    jobTitle:   jobTitle   ?? null,
    avatarUrl:  avatarUrl  ?? null,
    address:    address    ?? {},
    status:     status     ?? 'active',
    notes:      notes      ?? '',
    tags:       tags       ?? [],
    assignedTo: assignedTo ?? null,
    leadId:     leadId     ?? null,
    dealId:     dealId     ?? null,
  });

  res.status(201).json({ success: true, data: contact });
});

// ── PATCH /api/contacts/:id ───────────────────────────────────────────────────

exports.updateContact = catchAsync(async (req, res) => {
  const allowedFields = [
    'firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle',
    'avatarUrl', 'address', 'status', 'notes', 'tags', 'assignedTo',
  ];
  const updates = {};
  allowedFields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, organizationId: getOrgId(req), isDeleted: false },
    updates,
    { new: true, runValidators: true }
  )
    .populate('assignedTo', 'firstName lastName email')
    .populate('leadId',     'firstName lastName')
    .populate('dealId',     'title stage');

  if (!contact) throw new ApiError('Contact not found', 404);

  res.status(200).json({ success: true, data: contact });
});

// ── DELETE /api/contacts/:id  (soft delete) ───────────────────────────────────

exports.deleteContact = catchAsync(async (req, res) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, organizationId: getOrgId(req), isDeleted: false },
    { isDeleted: true },
    { new: true }
  );

  if (!contact) throw new ApiError('Contact not found', 404);

  res.status(200).json({ success: true, message: 'Contact deleted' });
});
