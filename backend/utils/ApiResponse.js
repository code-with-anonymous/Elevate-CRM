// ─────────────────────────────────────────────────────────────────────────────
// utils/ApiResponse.js — Standardised success response builder
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

class ApiResponse {
  /**
   * @param {import('express').Response} res
   * @param {number}  statusCode
   * @param {string}  message
   * @param {any}     [data]
   * @param {object}  [meta]   pagination, etc.
   */
  static send(res, statusCode, message, data = null, meta = null) {
    const body = { success: true, message };
    if (data  !== null) body.data = data;
    if (meta  !== null) body.meta = meta;
    return res.status(statusCode).json(body);
  }

  static ok(res, message, data, meta)      { return ApiResponse.send(res, 200, message, data, meta); }
  static created(res, message, data, meta) { return ApiResponse.send(res, 201, message, data, meta); }
}

module.exports = ApiResponse;
