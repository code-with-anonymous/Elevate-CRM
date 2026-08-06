// ─────────────────────────────────────────────────────────────────────────────
// routes/tasks.routes.js
// RBAC policy matches leads.routes.js — read/viewer, write/member, delete/manager.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const express = require('express');
const router  = express.Router();

const { protect } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const {
  getTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
} = require('../controllers/tasks.controller');

router.use(protect);

const canWrite = requireMinRole('member');
const canDelete = requireMinRole('manager');

router.route('/')
  .get(getTasks)
  .post(canWrite, createTask);

router.route('/:id')
  .get(getTask)
  .patch(canWrite, updateTask)
  .delete(canDelete, deleteTask);

// Completing a task is a write, not a delete — members tick their own boxes.
router.patch('/:id/complete', canWrite, completeTask);

module.exports = router;
