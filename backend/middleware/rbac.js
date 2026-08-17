// ─────────────────────────────────────────────────────────────────────────────
// middleware/rbac.js — Role-Based Access Control middleware
//
// These guards read the role out of the ACCESS TOKEN, not the database. That's a
// deliberate trade (one fewer query per request) with one consequence worth
// knowing: a role change lands when the victim's token is next reissued, not
// instantly. team.controller.js revokes their refresh tokens on a role change so
// the window is bounded by ACCESS_TOKEN_EXPIRES and can't be refreshed past.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const ApiError = require('../utils/ApiError');
const {
  normalizeRole,
  roleLevel,
  permissionsForRole,
} = require('../config/permissions');

/**
 * Pull the caller's role off the request, normalised.
 *
 * Roles cross this process boundary in two cases — lowercase from Mongo, and
 * UPPERCASE where a response was serialised for the frontend enum. A raw
 * `roles.includes(req.user.role)` compared one against the other and silently
 * denied everyone, which is the failure mode this indirection exists to prevent.
 */
function actorRole(req) {
  return normalizeRole(req.user?.role);
}

/**
 * Allow only users whose role is in the provided list.
 * Comparison is case-insensitive on both sides.
 * @param {...string} roles
 */
function requireRole(...roles) {
  const allowed = roles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    if (!allowed.includes(actorRole(req))) {
      return next(
        ApiError.forbidden(
          `This action requires one of these roles: ${roles.join(', ')}`,
          'INSUFFICIENT_ROLE'
        )
      );
    }
    return next();
  };
}

/**
 * Allow only users whose role level >= the minimum role.
 * E.g. requireMinRole('manager') allows manager, admin, owner.
 * @param {string} minRole
 */
function requireMinRole(minRole) {
  const minLevel = roleLevel(minRole);

  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    if (roleLevel(actorRole(req)) < minLevel) {
      return next(
        ApiError.forbidden(`Requires at least "${minRole}" role`, 'INSUFFICIENT_ROLE')
      );
    }
    return next();
  };
}

/**
 * Allow only users who hold the specified permission.
 *
 * The permission list comes from the token, which now carries a role-derived set
 * (see config/permissions.js). Tokens issued before that change carry an empty
 * array, so an empty/absent claim falls back to deriving from the role rather
 * than denying — otherwise every already-signed-in user would eat spurious 403s
 * until their access token expired.
 *
 * @param {string} perm
 */
function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    const claimed = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const effective = claimed.length ? claimed : permissionsForRole(actorRole(req));

    if (!effective.includes(perm)) {
      return next(
        ApiError.forbidden(`Missing permission: ${perm}`, 'INSUFFICIENT_PERMISSION')
      );
    }
    return next();
  };
}

module.exports = { requireRole, requireMinRole, requirePermission };
