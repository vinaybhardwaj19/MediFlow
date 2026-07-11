/**
 * @file appointment.controller.js — Phase 2: WebRTC + Email integrated
 */
const ApiResponse    = require('../utils/ApiResponse');
const ApiError       = require('../utils/ApiError');
const Appointment    = require('../models/Appointment.model');
const User           = require('../models/User.model');
const { generateRoomTokens } = require('../services/webrtc.service');
const emailService   = require('../services/email.service');
const { v4: uuidv4 } = require('uuid');

exports.bookAppointment = async (req, res) => {
  const { doctorId, scheduledAt, type, chiefComplaint, triageRecordId } = req.body;

  // Prevent double-booking: doctor must be free at that slot
  const conflict = await Appointment.findOne({
    doctorId,
    status     : { $in: ['pending','confirmed','in_progress'] },
    scheduledAt: { $lt: new Date(new Date(scheduledAt).getTime() + 30 * 60 * 1000) },
    endAt      : { $gt: new Date(scheduledAt) },
  });
  if (conflict) throw ApiError.conflict('Doctor is not available at this time slot');

  const start = new Date(scheduledAt);
  const end   = new Date(start.getTime() + 30 * 60 * 1000);

  const appt = await Appointment.create({
    patientId: req.user.id, doctorId, scheduledAt: start, endAt: end,
    type, chiefComplaint, triageRecordId,
  });

  return ApiResponse.created(res, appt, 'Appointment booked');
};

exports.listAppointments = async (req, res) => {
  const { status, from, to, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (req.user.role === 'patient') filter.patientId = req.user.id;
  else if (req.user.role === 'doctor') filter.doctorId = req.user.id;

  if (status) filter.status = status;
  if (from || to) {
    filter.scheduledAt = {};
    if (from) filter.scheduledAt.$gte = new Date(from);
    if (to)   filter.scheduledAt.$lte = new Date(to);
  }

  const [appts, total] = await Promise.all([
    Appointment.find(filter)
      .sort({ scheduledAt: -1 }).skip((page-1)*limit).limit(Number(limit))
      .populate('patientId','firstName lastName')
      .populate('doctorId', 'firstName lastName'),
    Appointment.countDocuments(filter),
  ]);
  return ApiResponse.ok(res, appts, 'Appointments retrieved', { total, page: Number(page) });
};

exports.getAppointment = async (req, res) => {
  const appt = await Appointment.findById(req.params.id)
    .populate('patientId','firstName lastName email')
    .populate('doctorId', 'firstName lastName email');
  if (!appt) throw ApiError.notFound('Appointment not found');

  // Patients may only view their own
  if (req.user.role === 'patient' && appt.patientId._id.toString() !== req.user.id) {
    throw ApiError.forbidden('Access denied');
  }
  return ApiResponse.ok(res, appt);
};

exports.updateAppointmentStatus = async (req, res) => {
  const { status } = req.body;
  const appt = await Appointment.findById(req.params.id)
    .populate('patientId','firstName email')
    .populate('doctorId', 'firstName lastName');
  if (!appt) throw ApiError.notFound('Appointment not found');

  const update = { status };

  // Generate WebRTC room tokens when doctor confirms
  if (status === 'confirmed') {
    const { roomId } = generateRoomTokens({
      appointmentId: appt._id.toString(),
      patientId    : appt.patientId._id.toString(),
      doctorId     : appt.doctorId._id.toString(),
    });
    update['consultationRoom.roomId'] = roomId;

    // Send confirmation email to patient — non-blocking
    emailService.sendAppointmentConfirmation({
      to         : appt.patientId.email,
      patientName: appt.patientId.firstName,
      doctorName : `${appt.doctorId.firstName} ${appt.doctorId.lastName}`,
      scheduledAt: appt.scheduledAt,
      type       : appt.type,
      appointmentId: appt._id.toString(),
    });
  }

  const updated = await Appointment.findByIdAndUpdate(req.params.id, update, { new: true });
  return ApiResponse.ok(res, updated, 'Status updated');
};

exports.cancelAppointment = async (req, res) => {
  const { reason } = req.body;
  const appt = await Appointment.findByIdAndUpdate(
    req.params.id,
    { status: 'cancelled', cancelledBy: req.user.id, cancellationReason: reason },
    { new: true }
  );
  if (!appt) throw ApiError.notFound('Appointment not found');
  return ApiResponse.ok(res, appt, 'Appointment cancelled');
};

/**
 * GET /:id/room-token
 * Issues a fresh ephemeral signaling JWT to the authenticated participant.
 * Only works for confirmed appointments where the requester is a participant.
 */
exports.getConsultationToken = async (req, res) => {
  const appt = await Appointment.findById(req.params.id);
  if (!appt) throw ApiError.notFound('Appointment not found');
  if (appt.status !== 'confirmed' && appt.status !== 'in_progress')
    throw ApiError.badRequest('Room is only available for confirmed or in-progress appointments');

  const isPatient = appt.patientId.toString() === req.user.id;
  const isDoctor  = appt.doctorId.toString()  === req.user.id;
  if (!isPatient && !isDoctor) throw ApiError.forbidden('You are not a participant in this appointment');

  const { roomId, patientToken, doctorToken } = generateRoomTokens({
    appointmentId: appt._id.toString(),
    patientId    : appt.patientId.toString(),
    doctorId     : appt.doctorId.toString(),
  });

  // Update roomId in DB
  await Appointment.findByIdAndUpdate(req.params.id, { 'consultationRoom.roomId': roomId });

  return ApiResponse.ok(res, {
    roomId,
    token: isPatient ? patientToken : doctorToken,
  }, 'Consultation room token issued');
};
