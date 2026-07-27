/**
 * @file Medicine.model.js
 * @description E-Pharmacy product catalogue.
 * Full-text indexes on name + genericName enable fast medicine search.
 */

const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  name               : { type: String, required: true, trim: true },
  genericName        : { type: String, trim: true },
  brand              : String,
  category           : { type: String, enum: ['prescription','otc','controlled'], required: true },
  therapeuticClass   : String,
  description        : String,
  dosageForms        : [{ type: String, enum: ['tablet','capsule','syrup','injection','topical','inhaler'] }],
  strengthOptions    : [String],   // e.g. ["250mg","500mg"]
  requiresPrescription: { type: Boolean, default: false },
  isHighRisk         : { type: Boolean, default: false }, // Heavy medicines that can harm if misused
  price              : { type: Number, min: 0 }, // USD cents per unit
  images             : [String],
  sideEffects        : [String],
  contraindications  : [String],
  isActive           : { type: Boolean, default: true, index: true },
}, { timestamps: true });

medicineSchema.index({ name: 'text', genericName: 'text', brand: 'text' });
medicineSchema.index({ category: 1 });
medicineSchema.index({ requiresPrescription: 1 });

const Medicine = mongoose.model('Medicine', medicineSchema);
module.exports = Medicine;
