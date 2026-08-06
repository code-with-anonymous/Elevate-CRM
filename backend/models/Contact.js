// ─────────────────────────────────────────────────────────────────────────────
// models/Contact.js
// A Contact is a real customer/stakeholder — distinct from a Lead.
// Contacts can be auto-created when a Deal moves to "Won" (via hook in deals.controller).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    organizationId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Organization',
      required: true,
      index:    true,
    },
    // If the contact was created from a Lead, link it
    leadId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Lead',
      default: null,
    },
    // If the contact was created from a won Deal, link it
    dealId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Deal',
      default: null,
    },
    assignedTo: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },

    // ── Personal info ─────────────────────────────────────────────────────────
    firstName: {
      type:     String,
      required: [true, 'First name is required'],
      trim:     true,
    },
    lastName: {
      type:  String,
      trim:  true,
      default: '',
    },
    email: {
      type:  String,
      trim:  true,
      lowercase: true,
      default: null,
    },
    phone: {
      type:  String,
      trim:  true,
      default: null,
    },
    company: {
      type:  String,
      trim:  true,
      default: null,
    },
    jobTitle: {
      type:  String,
      trim:  true,
      default: null,
    },
    avatarUrl: {
      type:  String,
      default: null,
    },

    // ── Address ───────────────────────────────────────────────────────────────
    address: {
      street:  { type: String, default: null },
      city:    { type: String, default: null },
      state:   { type: String, default: null },
      country: { type: String, default: null },
      zip:     { type: String, default: null },
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ['active', 'inactive', 'churned'],
      default: 'active',
    },

    // ── Soft delete ───────────────────────────────────────────────────────────
    isDeleted: {
      type:    Boolean,
      default: false,
      index:   true,
    },

    // ── Notes ─────────────────────────────────────────────────────────────────
    notes: {
      type:  String,
      default: '',
    },

    tags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

// ── Compound indexes for tenant queries ────────────────────────────────────────
contactSchema.index({ organizationId: 1, email: 1 });
contactSchema.index({ organizationId: 1, company: 1 });
contactSchema.index({ organizationId: 1, status: 1 });
contactSchema.index({ organizationId: 1, isDeleted: 1, createdAt: -1 });

// ── Virtual id ────────────────────────────────────────────────────────────────
contactSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

contactSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Contact', contactSchema);
