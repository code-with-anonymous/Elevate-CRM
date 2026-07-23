// ─────────────────────────────────────────────────────────────────────────────
// utils/asyncHandler.js — Wraps async route handlers to forward errors
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

/**
 * @param {Function} fn  Async route handler (req, res, next)
 * @returns {Function}
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
