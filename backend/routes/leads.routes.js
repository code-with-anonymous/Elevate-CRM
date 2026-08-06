'use strict';

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/leads.controller');

const router = Router();

router.use(verifyToken);

router.get('/', ctrl.getLeads);
router.post('/', ctrl.createLead);
router.get('/users', ctrl.getOrgUsers);
router.get('/:id', ctrl.getLeadById);
router.patch('/:id', ctrl.updateLead);
router.delete('/:id', ctrl.deleteLead);
router.patch('/:id/status', ctrl.updateLeadStatus);

module.exports = router;
