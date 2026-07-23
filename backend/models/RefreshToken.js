// ─────────────────────────────────────────────────────────────────────────────
// models/RefreshToken.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    token: {
      type: String,
      required: true,
      // stored as SHA-256 hash
    },
    userAgent: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// TTL index — MongoDB auto-deletes expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ token: 1 });

refreshTokenSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

refreshTokenSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) { delete ret.__v; },
});

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
