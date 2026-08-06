// ─────────────────────────────────────────────────────────────────────────────
// models/Organization.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      maxlength: [100, 'Organization name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'],
    },
    plan: {
      type: String,
      enum: ['free', 'starter', 'pro', 'enterprise'],
      default: 'free',
    },
    logoUrl: {
      type: String,
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    memberCount: {
      type: Number,
      default: 1,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // ── Org-wide display defaults ────────────────────────────────────────────
    // The API always stores and returns UTC; these only affect presentation,
    // and only where a user hasn't set their own preference.
    timezone: {
      type: String,
      default: 'UTC',
      trim: true,
    },
    dateFormat: {
      type: String,
      enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
      default: 'DD/MM/YYYY',
    },
  },
  { timestamps: true }
);

// Generate unique slug from name
organizationSchema.statics.generateSlug = async function (name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  let slug = base;
  let counter = 1;

  while (await this.exists({ slug })) {
    slug = `${base}-${counter++}`;
  }
  return slug;
};

// Virtual: id as string
organizationSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

organizationSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret.__v;
  },
});

module.exports = mongoose.model('Organization', organizationSchema);
