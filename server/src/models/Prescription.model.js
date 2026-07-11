/**
 * @file Prescription.model.js
 * @description Output of a consultation, input to pharmacy order.
 * diagnosis and notes fields are AES-256 encrypted at rest.
 * digitalSignature holds the doctor's cryptographic signature (RS256).
 */

const mongoose = require('mongoose');

const medicationLineSchema = new mongoose.Schema({
  medicineName : { type: String, required: true },
  medicineId   : { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' },
  dosage       : { type: String, required: true },
  frequency    : { type: String, required: true },
  duration     : String,
  instructions : String,
}, { _id: false });

const prescriptionSchema = new mongoose.Schema({
  appointmentId    : { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  patientId        : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctorId         : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  medications      : { type: [medicationLineSchema], required: true },
  diagnosis        : { type: String, select: false }, // AES-256 encrypted
  notes            : { type: String, select: false }, // AES-256 encrypted
  digitalSignature : String,
  isVerified       : { type: Boolean, default: false },
  expiresAt        : { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  status           : {
    type   : String,
    enum   : ['active','dispensed','expired','revoked'],
    default: 'active',
    index  : true,
  },
}, { timestamps: true });

const Prescription = mongoose.model('Prescription', prescriptionSchema);
module.exports = Prescription;
