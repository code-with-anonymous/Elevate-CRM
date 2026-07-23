// ─────────────────────────────────────────────────────────────────────────────
// middleware/errorHandler.js — Global error handler
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const env      = require('../config/env');
const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // ── Mongoose Validation Error ─────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field:   e.path,
      message: e.message,
    }));
    return res.status(400).json({
      success:  false,
      message:  'Validation failed',
      code:     'VALIDATION_ERROR',
      errors,
    });
  }

  // ── Mongoose Cast Error (invalid ObjectId) ────────────────────────────────
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
      code:    'INVALID_ID',
      errors:  [],
    });
  }

  // ── MongoDB Duplicate Key ─────────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
      code:    'DUPLICATE_KEY',
      errors:  [{ field, message: `${field} already exists` }],
    });
  }

  // ── JWT Errors ────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      code:    'INVALID_TOKEN',
      errors:  [],
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      code:    'TOKEN_EXPIRED',
      errors:  [],
    });
  }

  // ── CORS Errors ───────────────────────────────────────────────────────────
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      message: err.message,
      code:    'CORS_ERROR',
      errors:  [],
    });
  }

  // ── Custom ApiError ───────────────────────────────────────────────────────
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code:    err.code,
      errors:  err.errors || [],
    });
  }

  // ── Unhandled / Programming Errors ───────────────────────────────────────
  const statusCode = err.statusCode || 500;
  const message    = env.IS_PROD ? 'Internal server error' : (err.message || 'Internal server error');

  if (!env.IS_PROD) {
    console.error('❌ Unhandled error:', err);
  }

  return res.status(statusCode).json({
    success:  false,
    message,
    code:     'INTERNAL_ERROR',
    errors:   [],
    ...(env.IS_DEV && { stack: err.stack }),
  });
}

module.exports = errorHandler;
