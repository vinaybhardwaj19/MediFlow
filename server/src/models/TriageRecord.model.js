/**
 * @file TriageRecord.model.js
 * @description Stores ML engine output per patient session.
 * Supports both authenticated (patientId) and anonymous (sessionId) triage.
 */

const mongoose = require('mongoose');

const triageRecordSchema = new mongoose.Schema({
  patientId  : { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // null for anonymous
  sessionId  : { type: String, index: true },  // UUID for anonymous sessions
  symptoms   : { type: [String], required: true },
  symptomDetails: {
    duration   : String,
    severity   : { type: String, enum: ['mild','moderate','severe'] },
    onset      : String,
    location   : String,
    aggravating: [String],
    relieving  : [String],
  },
  vitalSigns: {
    temperature      : Number,   // °C
    heartRate        : Number,   // bpm
    bloodPressure    : { systolic: Number, diastolic: Number },
    oxygenSaturation : Number,   // %
  },
  mlPrediction: {
    recommendedSpecialty: String,
    confidence          : { type: Number, min: 0, max: 1 },
    urgencyLevel        : { type: String, enum: ['routine','urgent','emergency'], index: true },
    differentials       : [{
      condition   : String,
      probability : Number,
      _id         : false,
    }],
    modelVersion: String,
    severity: { type: String, enum: ['LOW','MEDIUM','HIGH','CRITICAL'], default: 'LOW' },
    recommendation: String,
    recommendationDetails: String,
  },
  ruleBasedFlags : [String],  // Hard-coded emergency keyword matches
  appointmentId  : { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
}, { timestamps: true, updatedAt: false });

triageRecordSchema.index({ createdAt: -1 });

const TriageRecord = mongoose.model('TriageRecord', triageRecordSchema);
module.exports = TriageRecord;
