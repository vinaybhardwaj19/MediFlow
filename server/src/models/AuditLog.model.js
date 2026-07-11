/**
 * @file AuditLog.model.js
 * @description Immutable compliance trail — append-only.
 * TTL index auto-expires records after 7 years (HIPAA requirement).
 * NEVER log raw PHI, passwords, or tokens in this collection.
 */

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId     : { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action     : { type: String, required: true },    // e.g. "LOGIN", "VIEW_PRESCRIPTION"
  resource   : String,                              // collection name
  resourceId : mongoose.Schema.Types.ObjectId,
  ipAddress  : String,
  userAgent  : String,
  method     : { type: String, enum: ['GET','POST','PUT','PATCH','DELETE'] },
  endpoint   : String,
  statusCode : Number,
  changes    : {
    before : mongoose.Schema.Types.Mixed,   // sanitized, no PHI
    after  : mongoose.Schema.Types.Mixed,
  },
  timestamp  : { type: Date, default: Date.now },
}, {
  // Disable updatedAt — audit records are immutable
  timestamps: false,
  // Prevent accidental updates/deletes at the schema level
  strict: true,
});

// HIPAA: auto-delete records older than 7 years (in seconds)
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 365 * 24 * 60 * 60 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;
