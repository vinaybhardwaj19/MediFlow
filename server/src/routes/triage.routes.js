/**
 * @file triage.routes.js — Phase 2: validation wired in
 */
const express = require('express');
const router  = express.Router();
const { verifyToken }    = require('../middleware/auth.middleware');
const { authorize }      = require('../middleware/rbac.middleware');
const { triageLimiter }  = require('../middleware/rateLimiter.middleware');
const { validate }       = require('../middleware/validate.middleware');
const schemas            = require('../utils/validators');
const {
  submitTriage, getTriageRecord, listPatientTriageHistory,
  getMLMetrics, getFederatedStats, checkDDI, getDDIGraph, extractClinicalEntities,
} = require('../controllers/triage.controller');

router.post('/', triageLimiter, validate(schemas.triage.submit), submitTriage);

// ML/XAI/DDI routes (v2.0)
router.get ('/ml/metrics',         verifyToken, getMLMetrics);
router.get ('/ml/federated',       verifyToken, getFederatedStats);
router.post('/ml/ddi/check',        verifyToken, checkDDI);
router.get ('/ml/ddi/graph',        verifyToken, getDDIGraph);
router.post('/nlp/extract',         verifyToken, extractClinicalEntities);

router.get ('/:id',             verifyToken, authorize('patient','doctor','admin'), getTriageRecord);
router.get ('/patient/:patientId', verifyToken, authorize('patient','doctor','admin'), listPatientTriageHistory);

module.exports = router;
