// ─────────────────────────────────────────────────────────────────────────────
// controllers/users.controller.js — the signed-in user's own record
//
// Scope rule: every handler here operates on req.user.sub. There is no
// `PATCH /users/:id` — editing *someone else* is a team operation and lives in
// team.controller.js behind an RBAC guard. Keeping "me" and "them" in separate
// files means a missing role check can't accidentally expose the wrong one.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const User = require('../models/User');
const authService = require('../services/auth.service');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Avatars are stored as data URLs on the user document rather than on disk or
// in S3 — no storage backend is configured, and the client downscales to
// 256×256 before upload, which lands well under this cap. Raise it and you're
// shipping the payload on every /auth/me response, so the cap is the design.
const MAX_AVATAR_BYTES = 200 * 1024;
const AVATAR_MIME = /^data:image\/(png|jpe?g|webp);base64,/;

// ── PATCH /api/users/me ───────────────────────────────────────────────────────
const updateMe = asyncHandler(async (req, res) => {
  const { firstName, lastName, phone } = req.body;

  const user = await User.findById(req.user.sub);
  if (!user) throw ApiError.notFound('User not found');

  if (firstName !== undefined) {
    if (!String(firstName).trim()) throw ApiError.badRequest('First name cannot be empty');
    user.firstName = String(firstName).trim();
  }
  if (lastName !== undefined) {
    if (!String(lastName).trim()) throw ApiError.badRequest('Last name cannot be empty');
    user.lastName = String(lastName).trim();
  }
  if (phone !== undefined) {
    user.phone = phone ? String(phone).trim() : null;
  }

  await user.save();

  return ApiResponse.ok(res, 'Profile updated', {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
  });
});

// ── POST /api/users/email ─────────────────────────────────────────────────────
// Changing an email de-verifies the account and re-runs the existing
// verification flow. It is NOT folded into updateMe: a name change and an
// identity change deserve different confirmations in the UI.
const changeEmail = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const next = String(email || '').trim().toLowerCase();

  if (!/^\S+@\S+\.\S+$/.test(next)) {
    throw ApiError.badRequest('Valid email is required');
  }

  const user = await User.findById(req.user.sub);
  if (!user) throw ApiError.notFound('User not found');
  if (user.email === next) throw ApiError.badRequest('That is already your email address');

  const taken = await User.findOne({ email: next });
  if (taken) throw ApiError.conflict('That email is already in use', 'EMAIL_TAKEN');

  user.email = next;
  user.isEmailVerified = false;
  await user.save();

  // Reuse the auth phase's verification mailer rather than a parallel one.
  await authService.resendVerification(next);

  return ApiResponse.ok(res, 'Email updated — check your inbox to verify it', {
    email: user.email,
    isEmailVerified: user.isEmailVerified,
  });
});

// ── POST /api/users/avatar ────────────────────────────────────────────────────
const uploadAvatar = asyncHandler(async (req, res) => {
  const { avatar } = req.body;

  if (typeof avatar !== 'string' || !AVATAR_MIME.test(avatar)) {
    throw ApiError.badRequest(
      'Avatar must be a base64 data URL (png, jpeg, or webp)',
      'INVALID_AVATAR'
    );
  }

  // Measure the decoded size, not the string length — base64 inflates by ~33%,
  // so validating the string would reject images that are actually in budget.
  const base64 = avatar.slice(avatar.indexOf(',') + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_AVATAR_BYTES) {
    throw ApiError.badRequest(
      `Avatar must be under ${Math.round(MAX_AVATAR_BYTES / 1024)}KB`,
      'AVATAR_TOO_LARGE'
    );
  }

  const user = await User.findByIdAndUpdate(
    req.user.sub,
    { avatarUrl: avatar },
    { new: true }
  ).select('avatarUrl');

  if (!user) throw ApiError.notFound('User not found');

  return ApiResponse.ok(res, 'Avatar updated', { avatarUrl: user.avatarUrl });
});

// ── DELETE /api/users/avatar ──────────────────────────────────────────────────
const removeAvatar = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user.sub, { avatarUrl: null });
  return ApiResponse.ok(res, 'Avatar removed', { avatarUrl: null });
});

// ── DELETE /api/users/me ──────────────────────────────────────────────────────
// The owner is the organisation's anchor — ownerId on Organization points at
// them, and every record is scoped to the org they hold. Letting them delete
// themselves would orphan the whole tenant, so it's blocked outright rather
// than silently reassigned to an arbitrary admin.
const deleteMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user) throw ApiError.notFound('User not found');

  if (user.role === 'owner') {
    throw ApiError.forbidden(
      'The organisation owner cannot delete their own account. Transfer ownership first.',
      'OWNER_CANNOT_DELETE'
    );
  }

  // Soft delete: isActive=false keeps the user document as a valid target for
  // every assignedTo reference on their leads, deals, and tasks. A hard delete
  // would leave those populating to null across the app.
  user.isActive = false;
  await user.save();

  return ApiResponse.ok(res, 'Account deactivated', { id: user._id.toString() });
});

// ── Notification preferences ──────────────────────────────────────────────────
// The canonical event list lives here, in the same order the UI renders it.
// Adding an event means adding it here AND to the User schema — the schema
// applies the default, this gates what a request is allowed to touch.
const NOTIFICATION_EVENTS = [
  'leadAssigned',
  'taskDueSoon',
  'dealWon',
  'teamChanges',
  'weeklySummary',
];

const CHANNELS = ['inApp', 'email'];

/** Fill in any event the stored document predates, so the UI never gets undefined. */
function serializePreferences(prefs) {
  const out = {};
  for (const event of NOTIFICATION_EVENTS) {
    out[event] = {
      inApp: prefs?.[event]?.inApp ?? false,
      email: prefs?.[event]?.email ?? false,
    };
  }
  return out;
}

// ── GET /api/users/notifications ──────────────────────────────────────────────
const getNotificationPreferences = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.sub).select('notificationPreferences');
  if (!user) throw ApiError.notFound('User not found');

  return ApiResponse.ok(res, 'Notification preferences', {
    preferences: serializePreferences(user.notificationPreferences),
    events: NOTIFICATION_EVENTS,
  });
});

// ── PATCH /api/users/notifications ────────────────────────────────────────────
// Accepts a partial map — { taskDueSoon: { email: true } } only touches that
// one channel. A whole-object PUT would make a stale client wipe preferences it
// didn't know existed.
const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const incoming = req.body?.preferences;

  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    throw ApiError.badRequest('Body must be { preferences: { … } }', 'INVALID_PREFERENCES');
  }

  const user = await User.findById(req.user.sub);
  if (!user) throw ApiError.notFound('User not found');

  const unknown = Object.keys(incoming).filter((k) => !NOTIFICATION_EVENTS.includes(k));
  if (unknown.length) {
    // Rejecting loudly beats ignoring silently: a client sending a renamed key
    // would otherwise think it had saved a setting that never applied.
    throw ApiError.badRequest(
      `Unknown notification event(s): ${unknown.join(', ')}`,
      'UNKNOWN_EVENT'
    );
  }

  for (const event of Object.keys(incoming)) {
    for (const channel of CHANNELS) {
      const value = incoming[event]?.[channel];
      if (value === undefined) continue;
      if (typeof value !== 'boolean') {
        throw ApiError.badRequest(`${event}.${channel} must be true or false`);
      }
      user.set(`notificationPreferences.${event}.${channel}`, value);
    }
  }

  await user.save();

  return ApiResponse.ok(res, 'Notification preferences updated', {
    preferences: serializePreferences(user.notificationPreferences),
    events: NOTIFICATION_EVENTS,
  });
});

module.exports = {
  updateMe,
  changeEmail,
  uploadAvatar,
  removeAvatar,
  deleteMe,
  getNotificationPreferences,
  updateNotificationPreferences,
  NOTIFICATION_EVENTS,
};
