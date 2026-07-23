// ─────────────────────────────────────────────────────────────────────────────
// middleware/validate.js — express-validator wrapper middleware
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Run after express-validator chains.
 * Collects errors and throws ApiError(400) if any exist.
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = result.array().map((err) => ({
      field:   err.path || err.param,
      message: err.msg,
    }));
    return next(
      ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', errors)
    );
  }
  return next();
}

module.exports = validate;
