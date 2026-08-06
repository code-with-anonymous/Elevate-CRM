// ─────────────────────────────────────────────────────────────────────────────
// controllers/organizations.controller.js
//
// There is no `:id` param anywhere in here. The organisation you can read and
// edit is the one on your token, full stop — an id in the URL would be an
// invitation to try someone else's.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const Organization = require('../models/Organization');
const User = require('../models/User');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const MAX_LOGO_BYTES = 200 * 1024;
const LOGO_MIME = /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/;

const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

function serialize(org, extra = {}) {
  return {
    id: org._id.toString(),
    name: org.name,
    // Slug is issued at registration and baked into nothing yet — but it will
    // be, so it's read-only from day one rather than after the first support
    // ticket about a broken link.
    slug: org.slug,
    plan: org.plan,
    logoUrl: org.logoUrl || null,
    timezone: org.timezone,
    dateFormat: org.dateFormat,
    memberCount: org.memberCount,
    createdAt: org.createdAt,
    ...extra,
  };
}

// ── GET /api/organizations/current ────────────────────────────────────────────
const getCurrent = asyncHandler(async (req, res) => {
  const org = await Organization.findById(req.organizationId);
  if (!org) throw ApiError.notFound('Organization not found');

  // memberCount on the document is a denormalised counter maintained by
  // invite/remove. Returning the live count alongside it means the Settings
  // page shows the truth even if the counter has drifted.
  const activeMembers = await User.countDocuments({
    organizationId: req.organizationId,
    isActive: true,
  });

  return ApiResponse.ok(res, 'Organization', serialize(org, { activeMembers }));
});

// ── PATCH /api/organizations/current ──────────────────────────────────────────
const updateCurrent = asyncHandler(async (req, res) => {
  const { name, timezone, dateFormat, logoUrl } = req.body;

  const org = await Organization.findById(req.organizationId);
  if (!org) throw ApiError.notFound('Organization not found');

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw ApiError.badRequest('Organization name cannot be empty');
    if (trimmed.length > 100) throw ApiError.badRequest('Organization name too long');
    org.name = trimmed;
  }

  if (timezone !== undefined) {
    // Validated against the runtime's own tz database rather than a hardcoded
    // list, so it can't drift out of date.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw ApiError.badRequest(`"${timezone}" is not a recognised timezone`, 'INVALID_TIMEZONE');
    }
    org.timezone = timezone;
  }

  if (dateFormat !== undefined) {
    if (!DATE_FORMATS.includes(dateFormat)) {
      throw ApiError.badRequest(`Date format must be one of: ${DATE_FORMATS.join(', ')}`);
    }
    org.dateFormat = dateFormat;
  }

  if (logoUrl !== undefined) {
    if (logoUrl === null || logoUrl === '') {
      org.logoUrl = null;
    } else {
      if (typeof logoUrl !== 'string' || !LOGO_MIME.test(logoUrl)) {
        throw ApiError.badRequest('Logo must be a base64 data URL', 'INVALID_LOGO');
      }
      const base64 = logoUrl.slice(logoUrl.indexOf(',') + 1);
      if (Math.floor((base64.length * 3) / 4) > MAX_LOGO_BYTES) {
        throw ApiError.badRequest(
          `Logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)}KB`,
          'LOGO_TOO_LARGE'
        );
      }
      org.logoUrl = logoUrl;
    }
  }

  await org.save();

  return ApiResponse.ok(res, 'Organization updated', serialize(org));
});

module.exports = { getCurrent, updateCurrent };
