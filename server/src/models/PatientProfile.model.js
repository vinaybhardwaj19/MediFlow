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

function safeEncrypt(val, aad = '') {
  if (!val || typeof val !== 'string' || isEncrypted(val)) return val;
  try {
    return encrypt(val, aad);
  } catch (err) {
    return val;
  }
}

function safeDecrypt(val, aad = '') {
  if (!val || typeof val !== 'string' || !isEncrypted(val)) return val;
  try {
    return decrypt(val, aad);
  } catch (err) {
    if (aad) {
      try {
        return decrypt(val, '');
      } catch (e2) {
        return val;
      }
    }
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
    policyNumber : { type: String }, // AES-256 encrypted
    groupNumber  : { type: String }, // AES-256 encrypted
  },
  // Soft reference array (not a DBRef) — avoids unbounded subdoc growth
  medicalHistoryIds : [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }],
}, { timestamps: true });

// ─── PHI Encryption & Decryption Hooks ──────────────────────────────────────────
patientProfileSchema.pre('save', function (next) {
  const docId = this._id ? this._id.toString() : '';
  if (this.insuranceInfo) {
    if (this.insuranceInfo.policyNumber) {
      this.insuranceInfo.policyNumber = safeEncrypt(this.insuranceInfo.policyNumber, docId + ':policyNumber');
    }
    if (this.insuranceInfo.groupNumber) {
      this.insuranceInfo.groupNumber = safeEncrypt(this.insuranceInfo.groupNumber, docId + ':groupNumber');
    }
  }
  if (this.emergencyContact && this.emergencyContact.phone) {
    this.emergencyContact.phone = safeEncrypt(this.emergencyContact.phone, docId + ':phone');
  }
  next();
});

function decryptPatientProfile(doc) {
  if (!doc) return;
  const docId = doc._id ? doc._id.toString() : '';
  if (doc.insuranceInfo) {
    if (doc.insuranceInfo.policyNumber) doc.insuranceInfo.policyNumber = safeDecrypt(doc.insuranceInfo.policyNumber, docId + ':policyNumber');
    if (doc.insuranceInfo.groupNumber) doc.insuranceInfo.groupNumber = safeDecrypt(doc.insuranceInfo.groupNumber, docId + ':groupNumber');
  }
  if (doc.emergencyContact && doc.emergencyContact.phone) {
    doc.emergencyContact.phone = safeDecrypt(doc.emergencyContact.phone, docId + ':phone');
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

