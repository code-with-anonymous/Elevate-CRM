// ─────────────────────────────────────────────────────────────────────────────
// routes/organizations.routes.js — /api/organizations/*
// Read: anyone in the org. Write: owner/admin only.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const ctrl = require('../controllers/organizations.controller');

const router = Router();

router.use(verifyToken);

// GET /api/organizations/current
router.get('/current', ctrl.getCurrent);

// PATCH /api/organizations/current
// Body carries a base64 logo, so app.js mounts a larger express.json() here.
router.patch('/current', requireRole('owner', 'admin'), ctrl.updateCurrent);

module.exports = router;
