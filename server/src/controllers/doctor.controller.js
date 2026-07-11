/**
 * @file doctor.controller.js — stub (Phase 2 full implementation)
 */
const ApiResponse = require('../utils/ApiResponse');
const ApiError    = require('../utils/ApiError');
const Doctor      = require('../models/Doctor.model');
const User        = require('../models/User.model');

exports.listDoctors = async (req, res) => {
  const { specialty, page = 1, limit = 12 } = req.query;
  const filter = specialty ? { specializations: { $regex: specialty, $options: 'i' } } : {};
  const [doctors, total] = await Promise.all([
    Doctor.find(filter).populate('userId','firstName lastName profileImage')
      .skip((page - 1) * limit).limit(Number(limit)),
    Doctor.countDocuments(filter),
  ]);
  return ApiResponse.ok(res, doctors, 'Doctors retrieved', { total, page: Number(page), limit: Number(limit) });
};

exports.getDoctorById = async (req, res) => {
  const doctor = await Doctor.findOne({ userId: req.params.id }).populate('userId','firstName lastName email profileImage');
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return ApiResponse.ok(res, doctor);
};

exports.getDoctorSlots = async (req, res) => {
  const doctor = await Doctor.findOne({ userId: req.params.id }).select('availableSlots');
  if (!doctor) throw ApiError.notFound('Doctor not found');
  return ApiResponse.ok(res, doctor.availableSlots);
};

exports.updateDoctorProfile = async (req, res) => {
  const doctor = await Doctor.findOneAndUpdate(
    { userId: req.params.id }, { $set: req.body }, { new: true, runValidators: true }
  );
  if (!doctor) throw ApiError.notFound('Doctor profile not found');
  return ApiResponse.ok(res, doctor, 'Profile updated');
};
