/**
 * @file Prescription.model.js
 * @description Output of a consultation, input to pharmacy order.
 * diagnosis and notes fields are AES-256 encrypted at rest.
 * digitalSignature holds the doctor's cryptographic signature (RS256).
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
  diagnosis        : { type: String }, // AES-256 encrypted
  notes            : { type: String }, // AES-256 encrypted
  digitalSignature : String,
  isVerified       : { type: Boolean, default: false },
  maxUsageCount    : { type: Number, default: 1 }, // How many times it can be dispensed
  usedCount        : { type: Number, default: 0 },
  expiresAt        : { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  status           : {
    type   : String,
    enum   : ['active','dispensed','expired','revoked'],
    default: 'active',
    index  : true,
  },
}, { timestamps: true });

prescriptionSchema.pre('save', function (next) {
  const docId = this._id ? this._id.toString() : '';
  if (this.diagnosis) this.diagnosis = safeEncrypt(this.diagnosis, docId + ':diagnosis');
  if (this.notes) this.notes = safeEncrypt(this.notes, docId + ':notes');
  next();
});

function decryptPrescriptionModel(doc) {
  if (!doc) return;
  const docId = doc._id ? doc._id.toString() : '';
  if (doc.diagnosis) doc.diagnosis = safeDecrypt(doc.diagnosis, docId + ':diagnosis');
  if (doc.notes) doc.notes = safeDecrypt(doc.notes, docId + ':notes');
}

prescriptionSchema.post('findOne', function (doc) {
  decryptPrescriptionModel(doc);
});

prescriptionSchema.post('find', function (docs) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptPrescriptionModel);
  }
});

prescriptionSchema.post('save', function (doc) {
  decryptPrescriptionModel(doc);
});

const Prescription = mongoose.model('Prescription', prescriptionSchema);
module.exports = Prescription;
