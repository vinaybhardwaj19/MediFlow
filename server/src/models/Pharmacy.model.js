/**
 * @file Pharmacy.model.js
 * @description Warehouse node in the Dijkstra routing graph.
 * address.coordinates uses 2dsphere index for geo-proximity queries.
 * routingWeight is the base edge cost used by the routing engine.
 */

const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  medicineId   : { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  stock        : { type: Number, min: 0, default: 0 },
  reorderLevel : { type: Number, default: 10 },
  batchNumber  : String,
  expiresAt    : Date,
}, { _id: false });

const operatingHoursSchema = new mongoose.Schema({
  dayOfWeek : { type: Number, min: 0, max: 6 },
  open      : String,   // "HH:MM"
  close     : String,
}, { _id: false });

const pharmacySchema = new mongoose.Schema({
  name          : { type: String, required: true, trim: true },
  licenseNumber : { type: String, unique: true, required: true },
  address: {
    street      : String,
    city        : String,
    state       : String,
    zip         : String,
    country     : String,
    coordinates : {
      type  : { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
  },
  operatingHours : [operatingHoursSchema],
  contactPhone   : String,
  isActive       : { type: Boolean, default: true, index: true },
  deliveryRadius : { type: Number, default: 10 }, // km
  inventory      : [inventoryItemSchema],
  routingWeight  : { type: Number, default: 1 }, // Graph edge cost for Dijkstra
}, { timestamps: true });

// 2dsphere index enables $near and $geoWithin queries
pharmacySchema.index({ 'address.coordinates': '2dsphere' });

const Pharmacy = mongoose.model('Pharmacy', pharmacySchema);
module.exports = Pharmacy;
