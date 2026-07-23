// ─────────────────────────────────────────────────────────────────────────────
// middleware/rbac.js — Role-Based Access Control middleware
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const ApiError = require('../utils/ApiError');

const ROLE_HIERARCHY = {
  owner:   5,
  admin:   4,
  manager: 3,
  member:  2,
  viewer:  1,
};

/**
 * Allow only users whose role is in the provided list.
 * @param {...string} roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    if (!roles.includes(req.user.role)) {
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
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const minLevel  = ROLE_HIERARCHY[minRole] || 0;
    if (userLevel < minLevel) {
      return next(
        ApiError.forbidden(`Requires at least "${minRole}" role`, 'INSUFFICIENT_ROLE')
      );
    }
    return next();
  };
}

/**
 * Allow only users who have the specified permission string.
 * @param {string} perm
 */
function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    const permissions = req.user.permissions || [];
    if (!permissions.includes(perm)) {
      return next(
        ApiError.forbidden(`Missing permission: ${perm}`, 'INSUFFICIENT_PERMISSION')
      );
    }
    return next();
  };
}

module.exports = { requireRole, requireMinRole, requirePermission };
