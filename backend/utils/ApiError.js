// ─────────────────────────────────────────────────────────────────────────────
// utils/ApiError.js — Custom error class with HTTP status codes
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

class ApiError extends Error {
  /**
   * @param {number}   statusCode
   * @param {string}   message
   * @param {string}   [code]       machine-readable error code
   * @param {Array}    [errors]     field-level validation errors
   * @param {boolean}  [isOperational]  false = programming error → 500
   */
  constructor(statusCode, message, code = 'ERROR', errors = [], isOperational = true) {
    if (typeof statusCode === 'string' && typeof message === 'number') {
      const temp = statusCode;
      statusCode = message;
      message = temp;
    }
    super(typeof message === 'string' ? message : 'An error occurred');
    this.name          = 'ApiError';
    this.statusCode    = typeof statusCode === 'number' ? statusCode : 500;
    this.code          = code;
    this.errors        = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  // ── Convenience factories ─────────────────────────────────────────────────

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', errors = []) {
    return new ApiError(400, message, code, errors);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }

  static conflict(message = 'Conflict', code = 'CONFLICT') {
    return new ApiError(409, message, code);
  }

  static tooMany(message = 'Too many requests', code = 'RATE_LIMITED') {
    return new ApiError(429, message, code);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR') {
    return new ApiError(500, message, code, [], false);
  }
}

module.exports = ApiError;
