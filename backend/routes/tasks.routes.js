// ─────────────────────────────────────────────────────────────────────────────
// routes/tasks.routes.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const express = require('express');
const router  = express.Router();

const { protect } = require('../middleware/auth');
const {
  getTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
} = require('../controllers/tasks.controller');

router.use(protect);

router.route('/')
  .get(getTasks)
  .post(createTask);

router.route('/:id')
  .get(getTask)
  .patch(updateTask)
  .delete(deleteTask);

router.patch('/:id/complete', completeTask);

module.exports = router;
