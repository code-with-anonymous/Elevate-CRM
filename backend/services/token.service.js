// ─────────────────────────────────────────────────────────────────────────────
// services/token.service.js — JWT generation, verification, cookie helpers
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const env    = require('../config/env');
const RefreshToken = require('../models/RefreshToken');
const ApiError     = require('../utils/ApiError');

// ── Token generation ──────────────────────────────────────────────────────────

/**
 * Generate a short-lived access token.
 * Payload: { sub, role, organizationId }
 * @returns {string} signed JWT
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRES,
    issuer:    'elevate-crm',
  });
}

/**
 * Generate a long-lived refresh token.
 * @returns {string} signed JWT
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES,
    issuer:    'elevate-crm',
  });
}

// ── Verification ──────────────────────────────────────────────────────────────

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.ACCESS_TOKEN_SECRET, { issuer: 'elevate-crm' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid access token', 'INVALID_TOKEN');
  }
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, env.REFRESH_TOKEN_SECRET, { issuer: 'elevate-crm' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }
}

// ── Hashing ───────────────────────────────────────────────────────────────────

/**
 * SHA-256 hash a token before storing in DB.
 * @param {string} token
 * @returns {string} hex hash
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a cryptographically random token (hex string).
 * @param {number} [bytes=32]
 * @returns {string}
 */
function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

/**
 * Set the httpOnly refresh token cookie.
 * @param {import('express').Response} res
 * @param {string} token  — raw JWT (not hashed)
 */
/**
 * Cookie attributes for the refresh token.
 *
 * Was hardcoded to `sameSite: 'strict'` in production, which silently breaks a
 * split deployment: a Strict cookie is NEVER sent on a cross-site request, so
 * with the app on vercel.app and the API on onrender.com, POST /auth/refresh
 * arrives with no cookie. The user gets signed out ~15 minutes after logging
 * in, every time, and it reads as broken auth rather than a cookie policy.
 *
 *   CROSS_SITE_COOKIES=true  → SameSite=None; Secure   (different domains)
 *   otherwise in production  → SameSite=Lax;  Secure   (shared domain)
 *   development              → SameSite=Lax            (http://localhost)
 *
 * `None` REQUIRES `Secure` — browsers silently drop the cookie otherwise — so
 * secure is forced on whenever cross-site is enabled.
 */
function refreshCookieOptions() {
  const crossSite = env.CROSS_SITE_COOKIES;
  return {
    httpOnly: true,
    secure:   crossSite || env.IS_PROD,
    sameSite: crossSite ? 'none' : 'lax',
    path:     '/',
  };
}

function setRefreshCookie(res, token) {
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  res.cookie('refreshToken', token, { ...refreshCookieOptions(), maxAge });
}

function clearRefreshCookie(res) {
  // Attributes must match the ones used to set it, or the browser keeps the
  // original cookie and "logout" leaves a live refresh token behind.
  res.clearCookie('refreshToken', refreshCookieOptions());
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * Save a hashed refresh token to the DB.
 * @param {string}  userId
 * @param {string}  rawToken  — raw JWT
 * @param {object}  req       — for userAgent / IP
 * @returns {Promise<import('../models/RefreshToken')>}
 */
async function saveRefreshToken(userId, rawToken, req) {
  const hashed    = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const refreshTokenDoc = await RefreshToken.create({
    userId,
    token:     hashed,
    userAgent: req?.headers?.['user-agent'] || null,
    ipAddress: req?.ip || null,
    expiresAt,
  });

  return refreshTokenDoc;
}

/**
 * Revoke a specific refresh token by its raw value.
 * @param {string} rawToken
 */
async function revokeRefreshToken(rawToken) {
  const hashed = hashToken(rawToken);
  await RefreshToken.updateOne({ token: hashed }, { isRevoked: true });
}

/**
 * Revoke ALL refresh tokens for a user.
 * @param {string} userId
 */
async function revokeAllUserTokens(userId) {
  await RefreshToken.updateMany({ userId, isRevoked: false }, { isRevoked: true });
}

/**
 * Parse expiry env string (e.g., "15m", "7d") → seconds for frontend expiresIn.
 * @param {string} expiresStr
 * @returns {number} seconds
 */
function parseExpiresIn(expiresStr) {
  const unit  = expiresStr.slice(-1);
  const value = parseInt(expiresStr.slice(0, -1), 10);
  const map   = { s: 1, m: 60, h: 3600, d: 86400 };
  return (map[unit] || 60) * value;
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  generateRandomToken,
  setRefreshCookie,
  clearRefreshCookie,
  saveRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  parseExpiresIn,
};
