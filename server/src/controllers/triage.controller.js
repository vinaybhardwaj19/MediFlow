/**
 * @file triage.controller.js — Phase 3: uses triage.service.js ML bridge
 */
const ApiResponse     = require('../utils/ApiResponse');
const ApiError        = require('../utils/ApiError');
const TriageRecord    = require('../models/TriageRecord.model');
const { predictSpecialty, EMERGENCY_KEYWORDS } = require('../services/triage.service');
const { v4: uuidv4 } = require('uuid');

/** POST /api/v1/triage */
exports.submitTriage = async (req, res) => {
  const { symptoms = [], symptomDetails, vitalSigns } = req.body;
  if (!symptoms.length) throw ApiError.badRequest('At least one symptom is required');

  // Rule-based flags (checked server-side even before ML for audit trail)
  const lowerJoined   = symptoms.map((s) => s.toLowerCase());
  const ruleBasedFlags = [...EMERGENCY_KEYWORDS].filter((k) => lowerJoined.includes(k));

  // Call ML service (with fallback inside triage.service)
  const mlPrediction = await predictSpecialty({ symptoms, symptomDetails, vitalSigns });

  const record = await TriageRecord.create({
    patientId    : req.user?.id || null,
    sessionId    : req.user ? undefined : uuidv4(),
    symptoms,
    symptomDetails,
    vitalSigns,
    mlPrediction,
    ruleBasedFlags,
  });

  return ApiResponse.created(res, record, 'Triage assessment complete');
};

/** GET /api/v1/triage/:id */
exports.getTriageRecord = async (req, res) => {
  const record = await TriageRecord.findById(req.params.id);
  if (!record) throw ApiError.notFound('Triage record not found');
  return ApiResponse.ok(res, record);
};

/** GET /api/v1/triage/patient/:patientId */
exports.listPatientTriageHistory = async (req, res) => {
  const records = await TriageRecord.find({ patientId: req.params.patientId })
    .sort({ createdAt: -1 }).limit(20);
  return ApiResponse.ok(res, records);
};

// ── ML Dashboard & DDI Controllers (v2.0) ───────────────────────────────────

const triageService = require('../services/triage.service');

/** GET /api/v1/triage/ml/metrics */
exports.getMLMetrics = async (req, res) => {
  const metrics = await triageService.getMLMetrics();
  return ApiResponse.ok(res, metrics);
};

/** GET /api/v1/triage/ml/federated */
exports.getFederatedStats = async (req, res) => {
  const stats = await triageService.getFederatedStats();
  return ApiResponse.ok(res, stats);
};

/** POST /api/v1/triage/ml/ddi/check */
exports.checkDDI = async (req, res) => {
  const { drugs } = req.body;
  if (!drugs || !Array.isArray(drugs) || drugs.length < 2) {
    throw ApiError.badRequest('At least 2 drugs are required for DDI check');
  }
  const result = await triageService.checkDDI(drugs);
  return ApiResponse.ok(res, result);
};

/** GET /api/v1/triage/ml/ddi/graph */
exports.getDDIGraph = async (req, res) => {
  const graph = await triageService.getDDIGraph();
  return ApiResponse.ok(res, graph);
};

/** POST /api/v1/triage/nlp/extract */
exports.extractClinicalEntities = async (req, res) => {
  const { notes } = req.body;
  if (!notes || !notes.trim()) {
    throw ApiError.badRequest('Notes are required');
  }
  const result = await triageService.extractClinicalEntities(notes);
  return ApiResponse.ok(res, result);
};


