// ─────────────────────────────────────────────────────────────────────────────
// models/Invitation.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'manager', 'member', 'viewer'],
      default: 'member',
    },
    token: {
      type: String,
      required: true,
      // stored as SHA-256 hash
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isAccepted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

invitationSchema.index({ token: 1 });
invitationSchema.index({ email: 1, organizationId: 1 });
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

invitationSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

invitationSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) { delete ret.__v; },
});

module.exports = mongoose.model('Invitation', invitationSchema);
