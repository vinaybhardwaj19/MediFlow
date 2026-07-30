/**
 * @file Family.model.js
 * @description Manages family circles and permissions for shared health monitoring.
 */

const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['guardian', 'dependent', 'member'], default: 'member' },
  status: { type: String, enum: ['pending', 'active', 'rejected'], default: 'pending' },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const familySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  members: [memberSchema],
  sharedRecords: {
    prescriptions: { type: Boolean, default: true },
    labReports: { type: Boolean, default: true },
    vitals: { type: Boolean, default: true }
  }
}, { timestamps: true });

const Family = mongoose.model('Family', familySchema);
module.exports = Family;
