/**
 * @file patient.controller.js — stub (Phase 2 full implementation)
 */
const ApiResponse   = require('../utils/ApiResponse');
const ApiError      = require('../utils/ApiError');
const PatientProfile = require('../models/PatientProfile.model');
const Appointment   = require('../models/Appointment.model');

exports.getProfile = async (req, res) => {
  const profile = await PatientProfile.findOne({ userId: req.params.id }).populate('userId','firstName lastName email');
  if (!profile) throw ApiError.notFound('Patient profile not found');
  return ApiResponse.ok(res, profile);
};

exports.updateProfile = async (req, res) => {
  const profile = await PatientProfile.findOneAndUpdate(
    { userId: req.params.id },
    { $set: req.body },
    { new: true, runValidators: true, upsert: true }
  );
  return ApiResponse.ok(res, profile, 'Profile updated');
};

exports.getMedicalHistory = async (req, res) => {
  const appointments = await Appointment.find({ patientId: req.params.id })
    .sort({ scheduledAt: -1 }).limit(50)
    .populate('doctorId','firstName lastName')
    .select('scheduledAt status type chiefComplaint');
  return ApiResponse.ok(res, appointments);
};
