/**
 * @file PatientProfile.model.js
 * @description 1:1 extension of User (role=patient).
 * insuranceInfo fields (policyNumber, groupNumber) are AES-256 encrypted at rest.
 */

const mongoose = require('mongoose');

const currentMedSchema = new mongoose.Schema({
  name      : String,
  dosage    : String,
  frequency : String,
}, { _id: false });

const patientProfileSchema = new mongoose.Schema({
  userId: {
    type    : mongoose.Schema.Types.ObjectId,
    ref     : 'User',
    required: true,
    unique  : true,
    index   : true,
  },
  bloodGroup : {
    type : String,
    enum : ['A+','A-','B+','B-','AB+','AB-','O+','O-'],
  },
  allergies         : [String],
  chronicConditions : [String],
  currentMedications: [currentMedSchema],
  emergencyContact  : {
    name     : String,
    relation : String,
    phone    : String,
  },
  insuranceInfo : {
    provider     : String,
    policyNumber : { type: String, select: false }, // AES-256 encrypted
    groupNumber  : { type: String, select: false }, // AES-256 encrypted
  },
  // Soft reference array (not a DBRef) — avoids unbounded subdoc growth
  medicalHistoryIds : [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }],
}, { timestamps: true });

const PatientProfile = mongoose.model('PatientProfile', patientProfileSchema);
module.exports = PatientProfile;
