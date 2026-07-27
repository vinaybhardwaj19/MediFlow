/**
 * @file Appointment.model.js
 * @description Junction entity between Patient and Doctor.
 * consultation notes are AES-256 encrypted at rest.
 * consultationRoom.signalingToken is a short-lived ephemeral JWT (2hr TTL).
 */

const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../services/encryption.service');

function isEncrypted(val) {
  if (typeof val !== 'string') return false;
  const parts = val.split(':');
  return parts.length === 3 && parts.every(part => /^[0-9a-fA-F]+$/.test(part));
}

function safeEncrypt(val) {
  if (!val || typeof val !== 'string' || isEncrypted(val)) return val;
  try {
    return encrypt(val);
  } catch (err) {
    return val;
  }
}

function safeDecrypt(val) {
  if (!val || typeof val !== 'string' || !isEncrypted(val)) return val;
  try {
    return decrypt(val);
  } catch (err) {
    return val;
  }
}

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
  chiefComplaint : { type: String, maxlength: 2000 },
  triageRecordId : { type: mongoose.Schema.Types.ObjectId, ref: 'TriageRecord' },
  consultationRoom: {
    roomId         : String,   // UUID generated on confirmation
    signalingToken : { type: String, select: false }, // Ephemeral WebRTC JWT
  },
  notes          : { type: String, maxlength: 4000 }, // AES-256 encrypted
  prescriptionId : { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
  cancelledBy    : { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: String,
  paymentStatus  : { type: String, enum: ['pending','paid','refunded','waived'], default: 'pending' },
  paymentAmount  : { type: Number, min: 0 }, // USD cents
}, { timestamps: true });

// Compound indexes for efficient calendar queries
appointmentSchema.index({ patientId: 1, scheduledAt: -1 });
appointmentSchema.index({ doctorId:  1, scheduledAt: -1 });

// ─── PHI Encryption & Decryption Hooks ──────────────────────────────────────────
appointmentSchema.pre('save', function (next) {
  if (this.notes) this.notes = safeEncrypt(this.notes);
  if (this.chiefComplaint) this.chiefComplaint = safeEncrypt(this.chiefComplaint);
  if (this.cancellationReason) this.cancellationReason = safeEncrypt(this.cancellationReason);
  next();
});

function decryptAppointment(doc) {
  if (!doc) return;
  if (doc.notes) doc.notes = safeDecrypt(doc.notes);
  if (doc.chiefComplaint) doc.chiefComplaint = safeDecrypt(doc.chiefComplaint);
  if (doc.cancellationReason) doc.cancellationReason = safeDecrypt(doc.cancellationReason);
}

appointmentSchema.post('findOne', function (doc) {
  decryptAppointment(doc);
});

appointmentSchema.post('find', function (docs) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptAppointment);
  }
});

appointmentSchema.post('save', function (doc) {
  decryptAppointment(doc);
});

const Appointment = mongoose.model('Appointment', appointmentSchema);
module.exports = Appointment;

