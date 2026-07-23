// ─────────────────────────────────────────────────────────────────────────────
// models/LoginHistory.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const loginHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    browser: {
      type: String,
      default: null,
    },
    os: {
      type: String,
      default: null,
    },
    device: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      required: true,
    },
  },
  { timestamps: true }
);

loginHistorySchema.index({ userId: 1, createdAt: -1 });

loginHistorySchema.virtual('id').get(function () {
  return this._id.toHexString();
});

loginHistorySchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) { delete ret.__v; },
});

module.exports = mongoose.model('LoginHistory', loginHistorySchema);
