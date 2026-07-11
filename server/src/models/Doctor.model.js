/**
 * @file Doctor.model.js
 * @description 1:1 extension of User (role=doctor).
 * licenseNumber is AES-256 encrypted at rest via encryption.service.
 * Text indexes on specializations enable full-text doctor search.
 */

const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  dayOfWeek    : { type: Number, min: 0, max: 6, required: true }, // 0=Sun
  startTime    : { type: String, required: true },  // "HH:MM"
  endTime      : { type: String, required: true },  // "HH:MM"
  slotDuration : { type: Number, default: 30 },     // minutes
}, { _id: false });

const qualificationSchema = new mongoose.Schema({
  degree      : { type: String, required: true },
  institution : { type: String, required: true },
  year        : { type: Number, required: true },
}, { _id: false });

const doctorSchema = new mongoose.Schema({
  userId          : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  licenseNumber   : { type: String, required: true, unique: true }, // stored encrypted
  specializations : { type: [String], required: true },
  subSpecialties  : [String],
  qualifications  : [qualificationSchema],
  experience      : { type: Number, min: 0 },       // years
  consultationFee : { type: Number, min: 0 },       // USD cents
  availableSlots  : [slotSchema],
  ratings: {
    average : { type: Number, default: 0, min: 0, max: 5 },
    count   : { type: Number, default: 0 },
  },
  isAcceptingPatients: { type: Boolean, default: true },
  hospitalAffiliation: String,
  bio             : { type: String, maxlength: 1000 },
  languages       : [String],
}, { timestamps: true });

// ─── Indexes ───────────────────────────────────────────────────────────────────
doctorSchema.index({ specializations: 'text', subSpecialties: 'text' });
doctorSchema.index({ 'ratings.average': -1 });
doctorSchema.index({ isAcceptingPatients: 1 });

const Doctor = mongoose.model('Doctor', doctorSchema);
module.exports = Doctor;
