// ─────────────────────────────────────────────────────────────────────────────
// routes/contacts.routes.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const express = require('express');
const router  = express.Router();

const { protect } = require('../middleware/auth');
const {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
} = require('../controllers/contacts.controller');

router.use(protect);

router.route('/')
  .get(getContacts)
  .post(createContact);

router.route('/:id')
  .get(getContact)
  .patch(updateContact)
  .delete(deleteContact);

module.exports = router;
