// ─────────────────────────────────────────────────────────────────────────────
// models/Lead.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    company: {
      type: String,
      trim: true,
      default: null,
    },
    source: {
      type: String,
      enum: ['Cold Outreach', 'Event', 'Social', 'Website', 'Referral', 'Other'],
      default: 'Other',
    },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'],
      default: 'New',
    },
    value: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    lastContactedAt: {
      type: Date,
      default: null,
    },
    // Automatically updated by pre-save hook whenever status changes
    statusChangedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    activityLog: [
      {
        status: { type: String },
        changedAt: { type: Date, default: Date.now },
        note: { type: String, default: null },
      },
    ],
  },
  { timestamps: true }
);

// ── Compound indexes for tenant-scoped queries ─────────────────────────────
leadSchema.index({ organizationId: 1, status: 1 });
leadSchema.index({ organizationId: 1, createdAt: -1 });
leadSchema.index({ organizationId: 1, source: 1 });

// ── Pre-save hook: stamp statusChangedAt whenever status changes ────────────
leadSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.statusChangedAt = new Date();
  }
  // Ensure statusChangedAt is set on first save
  if (!this.statusChangedAt) {
    this.statusChangedAt = this.createdAt || new Date();
  }
  next();
});

// ── Virtual: fullName ──────────────────────────────────────────────────────
leadSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

leadSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

leadSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Lead', leadSchema);
