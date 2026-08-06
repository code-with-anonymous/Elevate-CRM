// ─────────────────────────────────────────────────────────────────────────────
// routes/contacts.routes.js
// RBAC policy matches leads.routes.js — read/viewer, write/member, delete/manager.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const express = require('express');
const router  = express.Router();

const { protect } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/rbac');
const {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
} = require('../controllers/contacts.controller');

router.use(protect);

const canWrite = requireMinRole('member');
const canDelete = requireMinRole('manager');

router.route('/')
  .get(getContacts)
  .post(canWrite, createContact);

router.route('/:id')
  .get(getContact)
  .patch(canWrite, updateContact)
  .delete(canDelete, deleteContact);

module.exports = router;
