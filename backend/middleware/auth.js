// ─────────────────────────────────────────────────────────────────────────────
// middleware/auth.js — verifyToken middleware
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { verifyAccessToken } = require('../services/token.service');
const ApiError = require('../utils/ApiError');

/**
 * Pull and verify the Bearer token, or throw.
 * @returns decoded JWT payload
 */
function decodeBearer(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('No access token provided', 'NO_TOKEN');
  }

  return verifyAccessToken(authHeader.split(' ')[1]);
}

/**
 * Verify the Bearer access token in the Authorization header.
 * Attaches req.user and req.organizationId.
 *
 * Rejects two-factor temp tokens. THIS IS THE 2FA ENFORCEMENT POINT.
 *
 * auth.service.login() hands a caller who passed the password but not yet the
 * code a token carrying `twoFAPending: true`. That token is signed with the
 * ordinary access-token secret, so without the check below it verified cleanly
 * here and opened every protected route in the application — /auth/me, leads,
 * deals, contacts, all of it. The claim was written and never read, anywhere.
 *
 * The effect was that two-factor authentication could be skipped entirely with
 * the password alone. Anything that accepts a normal access token must refuse a
 * pending one; only verifyPendingToken, below, accepts it.
 */
function verifyToken(req, res, next) {
  try {
    const decoded = decodeBearer(req);

    if (decoded.twoFAPending) {
      return next(
        ApiError.unauthorized(
          'Two-factor authentication is not complete',
          'TWO_FA_REQUIRED'
        )
      );
    }

    req.user           = decoded;
    req.organizationId = decoded.organizationId;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * The mirror image: accepts ONLY a two-factor temp token.
 *
 * Mounted on POST /auth/verify-otp and nothing else. Rejecting fully-privileged
 * tokens here is not pedantry — it keeps this endpoint from being a way for an
 * already-signed-in session to act on some other half-finished login, and it
 * means the route's meaning ("finish a 2FA login") matches what it accepts.
 */
function verifyPendingToken(req, res, next) {
  try {
    const decoded = decodeBearer(req);

    if (!decoded.twoFAPending) {
      return next(
        ApiError.unauthorized(
          'This endpoint expects a two-factor verification token',
          'NOT_PENDING_2FA'
        )
      );
    }

    req.user           = decoded;
    req.organizationId = decoded.organizationId;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { verifyToken, verifyPendingToken, protect: verifyToken };
