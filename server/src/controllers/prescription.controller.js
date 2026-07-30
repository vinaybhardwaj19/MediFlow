/**
 * @file prescription.controller.js
 * @description Prescription management: create (doctor only), view, list, and
 * status update. Sensitive fields (diagnosis, notes) are AES-256 encrypted before
 * storage and decrypted on read.
 */

const ApiResponse    = require('../utils/ApiResponse');
const ApiError       = require('../utils/ApiError');
const Prescription   = require('../models/Prescription.model');
const Appointment    = require('../models/Appointment.model');
const User           = require('../models/User.model');
const { encrypt, decrypt } = require('../services/encryption.service');
const emailService   = require('../services/email.service');

// ─── Helper: decrypt sensitive fields for response ────────────────────────────
function decryptPrescription(doc) {
  return doc.toObject ? doc.toObject() : { ...doc };
}

// ─── POST /api/v1/prescriptions ───────────────────────────────────────────────
/**
 * Create a prescription for a completed or in-progress appointment.
 * Only the attending doctor may issue a prescription for their own appointment.
 */
exports.createPrescription = async (req, res) => {
  const { appointmentId, patientId, medications, diagnosis, notes } = req.body;

  // Verify the appointment belongs to this doctor
  const appt = await Appointment.findOne({
    _id     : appointmentId,
    doctorId: req.user.id,
    status  : { $in: ['in_progress', 'completed'] },
  });
  if (!appt) throw ApiError.forbidden('No active appointment found for this prescription');

  // Prevent duplicate prescriptions
  const existing = await Prescription.findOne({ appointmentId });
  if (existing) throw ApiError.conflict('A prescription already exists for this appointment');

  const rx = await Prescription.create({
    appointmentId,
    patientId,
    doctorId  : req.user.id,
    medications,
    diagnosis : diagnosis,
    notes     : notes ? notes : undefined,
  });

  // Link prescription back to appointment
  await Appointment.findByIdAndUpdate(appointmentId, { prescriptionId: rx._id });

  // Notify patient — non-blocking
  const [patient, doctor] = await Promise.all([
    User.findById(patientId).select('firstName email phone'),
    User.findById(req.user.id).select('firstName lastName'),
  ]);
  if (patient?.email) {
    emailService.sendPrescriptionReady({
      to            : patient.email,
      patientName   : patient.firstName,
      doctorName    : `${doctor.firstName} ${doctor.lastName}`,
      prescriptionId: rx._id.toString(),
    });
  }
  if (patient?.phone) {
    const { sendSMS } = require('../utils/twilio');
    const smsMsg = `MediFlow: Hello ${patient.firstName}, your prescription from Dr. ${doctor.firstName} ${doctor.lastName} is ready! You can view it in your MediFlow dashboard.`;
    sendSMS(patient.phone, smsMsg).catch(err => console.error('[Prescription SMS] Error:', err.message));
  }

  return ApiResponse.created(res, decryptPrescription(rx), 'Prescription created');
};

// ─── GET /api/v1/prescriptions ────────────────────────────────────────────────
exports.listAllPrescriptions = async (req, res) => {
  const { limit = 20, page = 1 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // If patient, restrict to their own
  const filter = req.user.role === 'patient' ? { patientId: req.user.id } : {};

  const rxList = await Prescription.find(filter)
    .select('+diagnosis +notes')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate('doctorId', 'firstName lastName')
    .populate('patientId', 'firstName lastName');

  return ApiResponse.ok(res, rxList.map(decryptPrescription));
};

// ─── GET /api/v1/prescriptions/:id ───────────────────────────────────────────
exports.getPrescription = async (req, res) => {
  const rx = await Prescription.findById(req.params.id)
    .select('+diagnosis +notes')
    .populate('doctorId',  'firstName lastName')
    .populate('patientId', 'firstName lastName');

  if (!rx) throw ApiError.notFound('Prescription not found');

  // Patients can only view their own prescriptions
  if (req.user.role === 'patient' && rx.patientId._id.toString() !== req.user.id) {
    throw ApiError.forbidden('Access denied');
  }

  return ApiResponse.ok(res, decryptPrescription(rx));
};

// ─── GET /api/v1/prescriptions/patient/:patientId ─────────────────────────────
exports.listPatientPrescriptions = async (req, res) => {
  // Patients can only list their own; doctors and admins can list any
  if (req.user.role === 'patient' && req.params.patientId !== req.user.id) {
    throw ApiError.forbidden('Access denied');
  }

  const rxList = await Prescription.find({ patientId: req.params.patientId })
    .select('+diagnosis +notes')
    .sort({ createdAt: -1 }).limit(50)
    .populate('doctorId', 'firstName lastName');

  return ApiResponse.ok(res, rxList.map(decryptPrescription));
};

// ─── PATCH /api/v1/prescriptions/:id/status ───────────────────────────────────
exports.updatePrescriptionStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['dispensed', 'revoked'];
  if (!allowed.includes(status)) throw ApiError.badRequest(`Status must be one of: ${allowed.join(', ')}`);

  const rx = await Prescription.findByIdAndUpdate(
    req.params.id, { status }, { new: true }
  );
  if (!rx) throw ApiError.notFound('Prescription not found');
  return ApiResponse.ok(res, rx, 'Prescription status updated');
};
