// ─────────────────────────────────────────────────────────────────────────────
// models/Deal.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    title: {
      type: String,
      required: [true, 'Deal title is required'],
      trim: true,
    },
    value: {
      type: Number,
      required: [true, 'Deal value is required'],
      min: 0,
    },
    stage: {
      type: String,
      enum: ['Lead', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'],
      default: 'Lead',
    },
    expectedCloseDate: {
      type: Date,
      default: null,
    },
    // Set automatically by pre-save hook when stage moves to Won or Lost
    closedAt: {
      type: Date,
      default: null,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      trim: true,
    },
  },
  { timestamps: true }
);

// ── Compound indexes for tenant-scoped queries ─────────────────────────────
dealSchema.index({ organizationId: 1, stage: 1 });
dealSchema.index({ organizationId: 1, closedAt: -1 });

// ── Pre-save hook: stamp closedAt when stage moves to Won or Lost ──────────
dealSchema.pre('save', function (next) {
  const closingStages = ['Won', 'Lost'];
  if (this.isModified('stage') && closingStages.includes(this.stage)) {
    if (!this.closedAt) {
      this.closedAt = new Date();
    }
  }
  next();
});

dealSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

dealSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Deal', dealSchema);
