const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth.middleware');
const dataRightsController = require('../controllers/data-rights.controller');

// DPDP Act compliance routes
router.get('/export/:patientId', verifyToken, dataRightsController.exportData);
router.delete('/erase/:patientId', verifyToken, dataRightsController.eraseData);

module.exports = router;
