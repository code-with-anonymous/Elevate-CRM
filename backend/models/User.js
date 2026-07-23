// ─────────────────────────────────────────────────────────────────────────────
// models/User.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned in queries by default
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'manager', 'member', 'viewer'],
      default: 'member',
    },
    permissions: {
      type: [String],
      default: [],
    },
    phone: {
      type: String,
      default: null,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifyToken: {
      type: String,
      default: null,
      select: false,
    },
    emailVerifyExpiry: {
      type: Date,
      default: null,
      select: false,
    },
    is2FAEnabled: {
      type: Boolean,
      default: false,
    },
    twoFASecret: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpiry: {
      type: Date,
      default: null,
      select: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Indexes
userSchema.index({ organizationId: 1 });
userSchema.index({ emailVerifyToken: 1 });
userSchema.index({ passwordResetToken: 1 });

// Virtual: fullName
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// Safe JSON output — strip sensitive fields
userSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    delete ret.emailVerifyToken;
    delete ret.emailVerifyExpiry;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpiry;
    delete ret.twoFASecret;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
