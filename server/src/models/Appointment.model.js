/**
 * @file Appointment.model.js
 * @description Junction entity between Patient and Doctor.
 * consultation notes are AES-256 encrypted at rest.
 * consultationRoom.signalingToken is a short-lived ephemeral JWT (2hr TTL).
 */

const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId  : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctorId   : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  scheduledAt: { type: Date, required: true, index: true },
  endAt      : { type: Date, required: true },
  status     : {
    type   : String,
    enum   : ['pending','confirmed','in_progress','completed','cancelled','no_show'],
    default: 'pending',
    index  : true,
  },
  type           : { type: String, enum: ['video','audio','chat'], default: 'video' },
  chiefComplaint : { type: String, maxlength: 500 },
  triageRecordId : { type: mongoose.Schema.Types.ObjectId, ref: 'TriageRecord' },
  consultationRoom: {
    roomId         : String,   // UUID generated on confirmation
    signalingToken : { type: String, select: false }, // Ephemeral WebRTC JWT
  },
  notes          : { type: String, maxlength: 2000 }, // AES-256 encrypted
  prescriptionId : { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
  cancelledBy    : { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: String,
  paymentStatus  : { type: String, enum: ['pending','paid','refunded','waived'], default: 'pending' },
  paymentAmount  : { type: Number, min: 0 }, // USD cents
}, { timestamps: true });

// Compound indexes for efficient calendar queries
appointmentSchema.index({ patientId: 1, scheduledAt: -1 });
appointmentSchema.index({ doctorId:  1, scheduledAt: -1 });

const Appointment = mongoose.model('Appointment', appointmentSchema);
module.exports = Appointment;
