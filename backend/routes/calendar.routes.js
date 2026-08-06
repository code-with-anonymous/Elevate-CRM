// ─────────────────────────────────────────────────────────────────────────────
// routes/calendar.routes.js — All /api/calendar/* routes
// All routes: protected by verifyToken middleware
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/calendar.controller');

const router = Router();

// Every calendar route requires a valid JWT (verifyToken attaches req.organizationId)
router.use(verifyToken);

// GET /api/calendar/events?month=1-12&year=YYYY&types=task,deal
// Returns: month, year, range, counts, events[]
router.get('/events', ctrl.getEvents);

module.exports = router;
