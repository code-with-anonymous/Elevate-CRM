'use strict';

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/leads.controller');

const router = Router();

router.use(verifyToken);

router.post('/', ctrl.createLead);
router.get('/users', ctrl.getOrgUsers);

module.exports = router;
