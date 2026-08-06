// ─────────────────────────────────────────────────────────────────────────────
// controllers/team.controller.js — acting on OTHER users in the organisation
//
// This is the file where RBAC stops being theoretical. Every guard below is
// enforced here, server-side; the Team settings UI hides the same controls, but
// hiding a button is decoration — this is the control.
//
// Three invariants, in priority order:
//   1. Nobody can act on a user outside their own organisation.
//   2. The owner cannot be demoted or removed by anyone, including themselves.
//   3. You cannot act on someone at or above your own level in the hierarchy.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const User = require('../models/User');
const Organization = require('../models/Organization');
const Invitation = require('../models/Invitation');
const tokenService = require('../services/token.service');
const emailService = require('../services/email.service');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Mirrors middleware/rbac.js. Duplicated deliberately rather than imported:
// rbac.js gates *routes*, this gates *targets*, and conflating them is how
// "admin can edit admin" slips in.
const ROLE_LEVEL = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1 };
const ASSIGNABLE_ROLES = ['admin', 'manager', 'member', 'viewer'];

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Load a user who must belong to the actor's organisation.
 * Scoping the *query* rather than checking after the fetch means a wrong id
 * returns 404, never a cross-tenant record.
 */
async function findTeammate(id, organizationId) {
  const target = await User.findOne({ _id: id, organizationId });
  if (!target) throw ApiError.notFound('Team member not found');
  return target;
}

// ── GET /api/team/members ─────────────────────────────────────────────────────
// Readable by any authenticated member — knowing who your colleagues are isn't
// privileged. Mutating them is.
const getMembers = asyncHandler(async (req, res) => {
  const members = await User.find({ organizationId: req.organizationId })
    .select('firstName lastName email role avatarUrl isActive isEmailVerified lastLogin createdAt')
    .sort({ createdAt: 1 })
    .lean();

  return ApiResponse.ok(res, 'Team members', {
    members: members.map((m) => ({
      id: m._id.toString(),
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      role: m.role,
      avatarUrl: m.avatarUrl || null,
      // Three states, not two: an invited user who never accepted has no User
      // document at all (see getInvites), so anyone here has at least signed up.
      status: !m.isActive ? 'Suspended' : m.isEmailVerified ? 'Active' : 'Pending',
      lastLogin: m.lastLogin,
      joinedAt: m.createdAt,
    })),
    total: members.length,
  });
});

// ── PATCH /api/team/members/:id/role ──────────────────────────────────────────
const updateMemberRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const actorLevel = ROLE_LEVEL[req.user.role] || 0;

  if (!ASSIGNABLE_ROLES.includes(role)) {
    // 'owner' is absent from ASSIGNABLE_ROLES on purpose — transferring
    // ownership also has to move Organization.ownerId, so it needs its own
    // endpoint rather than riding in on a generic role change.
    throw ApiError.badRequest(
      `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
      'INVALID_ROLE'
    );
  }

  const target = await findTeammate(req.params.id, req.organizationId);

  if (target._id.toString() === req.user.sub) {
    throw ApiError.forbidden('You cannot change your own role', 'CANNOT_EDIT_SELF');
  }
  if (target.role === 'owner') {
    throw ApiError.forbidden('The organisation owner’s role cannot be changed', 'OWNER_PROTECTED');
  }
  if ((ROLE_LEVEL[target.role] || 0) >= actorLevel) {
    throw ApiError.forbidden(
      'You cannot change the role of someone at or above your own level',
      'INSUFFICIENT_ROLE'
    );
  }
  if ((ROLE_LEVEL[role] || 0) >= actorLevel) {
    // Without this an admin could mint another admin, which is a privilege
    // escalation dressed up as an ordinary edit.
    throw ApiError.forbidden(
      'You cannot grant a role at or above your own level',
      'INSUFFICIENT_ROLE'
    );
  }

  target.role = role;
  await target.save();

  return ApiResponse.ok(res, 'Role updated', {
    id: target._id.toString(),
    role: target.role,
  });
});

// ── DELETE /api/team/members/:id ──────────────────────────────────────────────
const removeMember = asyncHandler(async (req, res) => {
  const actorLevel = ROLE_LEVEL[req.user.role] || 0;
  const target = await findTeammate(req.params.id, req.organizationId);

  if (target._id.toString() === req.user.sub) {
    throw ApiError.forbidden('You cannot remove yourself', 'CANNOT_REMOVE_SELF');
  }
  if (target.role === 'owner') {
    throw ApiError.forbidden('The organisation owner cannot be removed', 'OWNER_PROTECTED');
  }
  if ((ROLE_LEVEL[target.role] || 0) >= actorLevel) {
    throw ApiError.forbidden(
      'You cannot remove someone at or above your own level',
      'INSUFFICIENT_ROLE'
    );
  }

  // Soft delete — their leads, deals and tasks still populate assignedTo.
  if (target.isActive) {
    target.isActive = false;
    await target.save();
    await Organization.findByIdAndUpdate(req.organizationId, { $inc: { memberCount: -1 } });
  }

  return ApiResponse.ok(res, 'Member removed', { id: target._id.toString() });
});

// ── GET /api/team/invites ─────────────────────────────────────────────────────
// Pending only. The TTL index on expiresAt reaps expired rows eventually, but
// "eventually" is up to 60s of Mongo's background sweep — filter explicitly so
// a just-expired invite never shows as actionable.
const getInvites = asyncHandler(async (req, res) => {
  const invites = await Invitation.find({
    organizationId: req.organizationId,
    isAccepted: false,
    expiresAt: { $gt: new Date() },
  })
    .populate('invitedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.ok(res, 'Pending invitations', {
    invites: invites.map((i) => ({
      id: i._id.toString(),
      email: i.email,
      role: i.role,
      invitedBy: i.invitedBy
        ? `${i.invitedBy.firstName} ${i.invitedBy.lastName}`
        : null,
      invitedAt: i.createdAt,
      expiresAt: i.expiresAt,
    })),
    total: invites.length,
  });
});

// ── POST /api/team/invites/:id/resend ─────────────────────────────────────────
const resendInvite = asyncHandler(async (req, res) => {
  const invite = await Invitation.findOne({
    _id: req.params.id,
    organizationId: req.organizationId,
    isAccepted: false,
  });
  if (!invite) throw ApiError.notFound('Invitation not found');

  // A fresh token, not the old one. Invitation.token stores a HASH, so the
  // original raw token is unrecoverable — resending "the same link" is not
  // possible, and rotating is the safer behaviour anyway.
  const rawToken = tokenService.generateRandomToken();
  invite.token = tokenService.hashToken(rawToken);
  invite.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await invite.save();

  const [inviter, org] = await Promise.all([
    User.findById(req.user.sub).select('firstName lastName'),
    Organization.findById(req.organizationId).select('name'),
  ]);

  await emailService.sendInvitationEmail(
    invite.email,
    inviter ? `${inviter.firstName} ${inviter.lastName}` : 'A teammate',
    org ? org.name : 'your organisation',
    rawToken
  );

  return ApiResponse.ok(res, 'Invitation resent', {
    id: invite._id.toString(),
    expiresAt: invite.expiresAt,
  });
});

// ── DELETE /api/team/invites/:id ──────────────────────────────────────────────
const revokeInvite = asyncHandler(async (req, res) => {
  const invite = await Invitation.findOneAndDelete({
    _id: req.params.id,
    organizationId: req.organizationId,
    isAccepted: false,
  });
  if (!invite) throw ApiError.notFound('Invitation not found');

  return ApiResponse.ok(res, 'Invitation revoked', { id: req.params.id });
});

module.exports = {
  getMembers,
  updateMemberRole,
  removeMember,
  getInvites,
  resendInvite,
  revokeInvite,
};
