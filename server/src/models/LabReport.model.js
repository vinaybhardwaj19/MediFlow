/**
 * @file LabReport.model.js
 * @description Model for laboratory test bookings and digital reports with AI summaries.
 */

const mongoose = require('mongoose');

const labReportSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  testName: { type: String, required: true, trim: true },
  labName: { type: String, required: true, trim: true },
  bookingDate: { type: Date, default: Date.now, index: true },
  status: {
    type: String,
    enum: ['booked', 'completed', 'cancelled'],
    default: 'booked',
    index: true
  },
  reportUrl: { type: String }, // URL or path to uploaded digital report
  aiExplanation: { type: String }, // Explaining laboratory results in simple terms
  results: {
    type: Map,
    of: String
  }
}, { timestamps: true });

const LabReport = mongoose.model('LabReport', labReportSchema);
module.exports = LabReport;
