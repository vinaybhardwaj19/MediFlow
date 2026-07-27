/**
 * @file PatientProfile.model.js
 * @description 1:1 extension of User (role=patient).
 * insuranceInfo fields (policyNumber, groupNumber) are AES-256 encrypted at rest.
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

// ─── PHI Encryption & Decryption Hooks ──────────────────────────────────────────
patientProfileSchema.pre('save', function (next) {
  if (this.insuranceInfo) {
    if (this.insuranceInfo.policyNumber) {
      this.insuranceInfo.policyNumber = safeEncrypt(this.insuranceInfo.policyNumber);
    }
    if (this.insuranceInfo.groupNumber) {
      this.insuranceInfo.groupNumber = safeEncrypt(this.insuranceInfo.groupNumber);
    }
  }
  if (this.emergencyContact && this.emergencyContact.phone) {
    this.emergencyContact.phone = safeEncrypt(this.emergencyContact.phone);
  }
  next();
});

function decryptPatientProfile(doc) {
  if (!doc) return;
  if (doc.insuranceInfo) {
    if (doc.insuranceInfo.policyNumber) doc.insuranceInfo.policyNumber = safeDecrypt(doc.insuranceInfo.policyNumber);
    if (doc.insuranceInfo.groupNumber) doc.insuranceInfo.groupNumber = safeDecrypt(doc.insuranceInfo.groupNumber);
  }
  if (doc.emergencyContact && doc.emergencyContact.phone) {
    doc.emergencyContact.phone = safeDecrypt(doc.emergencyContact.phone);
  }
}

patientProfileSchema.post('findOne', function (doc) {
  decryptPatientProfile(doc);
});

patientProfileSchema.post('find', function (docs) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptPatientProfile);
  }
});

patientProfileSchema.post('save', function (doc) {
  decryptPatientProfile(doc);
});

const PatientProfile = mongoose.model('PatientProfile', patientProfileSchema);
module.exports = PatientProfile;

