// ─────────────────────────────────────────────────────────────────────────────
// routes/search.routes.js — /api/search
// Any authenticated member. Results are org-scoped and read-only.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/search.controller');

const router = Router();

router.use(verifyToken);

// GET /api/search?q=
// Returns: query, groups { leads[], contacts[], tasks[] }, total
router.get('/', ctrl.search);

module.exports = router;
