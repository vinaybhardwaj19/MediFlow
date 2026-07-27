/**
 * @file triage.controller.js — Phase 3: uses triage.service.js ML bridge
 */
const ApiResponse     = require('../utils/ApiResponse');
const ApiError        = require('../utils/ApiError');
const TriageRecord    = require('../models/TriageRecord.model');
const User            = require('../models/User.model');
const { predictSpecialty, EMERGENCY_KEYWORDS } = require('../services/triage.service');
const { sendSMS }     = require('../utils/twilio');
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

  // Map urgency level and symptoms to Severity and Recommendations (Intelligent Severity Engine)
  let severity = 'LOW';
  let recommendation = 'Self care';
  let recommendationDetails = 'Based on your mild symptoms, we recommend self-care and monitoring. If symptoms persist or worsen, please schedule an appointment.';

  const urgency = mlPrediction.urgencyLevel?.toLowerCase() || 'routine';
  const hasEmergencyFlags = ruleBasedFlags.length > 0;
  
  // Check vital signs for high-risk values
  const sysBP = vitalSigns?.systolicBP;
  const hr = vitalSigns?.heartRate;
  const spo2 = vitalSigns?.oxygenSaturation;
  
  if (urgency === 'emergency' || hasEmergencyFlags || (spo2 && spo2 < 90) || (sysBP && (sysBP < 90 || sysBP > 180))) {
    severity = 'CRITICAL';
    recommendation = 'Emergency Response';
    recommendationDetails = 'CRITICAL: High-risk symptoms or abnormal vital signs detected. Please trigger the emergency SOS workflow immediately for guidance and hospital routing.';
  } else if (urgency === 'urgent' || (spo2 && spo2 < 94) || (hr && (hr < 50 || hr > 110))) {
    severity = 'HIGH';
    recommendation = 'Priority consultation';
    recommendationDetails = 'HIGH: Elevated risk markers found. We recommend initiating a priority telemedicine consultation with a specialist immediately.';
  } else if (symptomDetails?.severity === 'severe' || urgency === 'urgent') {
    severity = 'MEDIUM';
    recommendation = 'Appointment';
    recommendationDetails = 'MEDIUM: Moderate severity. We recommend booking a regular consultation/appointment with a doctor soon.';
  } else {
    severity = 'LOW';
    recommendation = 'Self care';
    recommendationDetails = 'LOW: Mild symptoms. Standard self-care and rest is advised. Monitor your vitals.';
  }

  // Populate model values
  mlPrediction.severity = severity;
  mlPrediction.recommendation = recommendation;
  mlPrediction.recommendationDetails = recommendationDetails;

  const record = await TriageRecord.create({
    patientId    : req.user?.id || null,
    sessionId    : req.user ? undefined : uuidv4(),
    symptoms,
    symptomDetails,
    vitalSigns,
    mlPrediction,
    ruleBasedFlags,
  });

  // If severity is HIGH or CRITICAL, fire-and-forget SMS alert (non-blocking, skipped in test env)
  if (req.user && (severity === 'HIGH' || severity === 'CRITICAL') && process.env.NODE_ENV !== 'test') {
    setImmediate(async () => {
      try {
        const user = await User.findById(req.user.id);
        if (user && user.phone) {
          const alertMsg = `MediFlow Alert: ${severity} priority warning. Recommended Specialty: ${mlPrediction.recommendedSpecialty}. Vitals: SBP: ${vitalSigns?.systolicBP || 'N/A'}, HR: ${vitalSigns?.heartRate || 'N/A'}, SpO2: ${vitalSigns?.oxygenSaturation || 'N/A'}%. Advice: ${recommendationDetails}`;
          await sendSMS(user.phone, alertMsg);
        }
      } catch (err) {
        console.error('[Triage SMS] Error sending alert:', err.message);
      }
    });
  }

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


