'use strict';

const Lead = require('../models/Lead');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

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
    status
  } = req.body;

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
    status: status || 'New'
  });

  return ApiResponse.created(res, 'Lead created successfully', lead);
});

// GET /api/leads/users
const getOrgUsers = asyncHandler(async (req, res) => {
  const User = require('../models/User');
  const users = await User.find({ organizationId: req.organizationId })
    .select('firstName lastName email');
  return ApiResponse.ok(res, 'Organization users fetched successfully', users);
});

module.exports = {
  createLead,
  getOrgUsers,
};
