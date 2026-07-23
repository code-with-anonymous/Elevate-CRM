// ─────────────────────────────────────────────────────────────────────────────
// models/Task.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Polymorphic reference — can point to a Lead, Deal, or Contact
    relatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedModel',
      default: null,
    },
    relatedModel: {
      type: String,
      enum: ['Lead', 'Deal', 'Contact'],
      default: null,
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Done'],
      default: 'Open',
    },
    dueDate: {
      type: Date,
      default: null,
    },
    // Stamped when status moves to Done
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ── Compound indexes for tenant-scoped queries ─────────────────────────────
taskSchema.index({ organizationId: 1, status: 1, dueDate: 1 });
taskSchema.index({ organizationId: 1, assignedTo: 1 });

// ── Pre-save hook: stamp completedAt when status moves to Done ─────────────
taskSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'Done') {
    if (!this.completedAt) {
      this.completedAt = new Date();
    }
  }
  next();
});

taskSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

taskSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Task', taskSchema);
