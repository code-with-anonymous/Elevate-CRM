// ─────────────────────────────────────────────────────────────────────────────
// middleware/auth.js — verifyToken middleware
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { verifyAccessToken } = require('../services/token.service');
const ApiError = require('../utils/ApiError');

/**
 * Verify the Bearer access token in the Authorization header.
 * Attaches req.user and req.organizationId.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('No access token provided', 'NO_TOKEN'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user           = decoded;
    req.organizationId = decoded.organizationId;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { verifyToken };
