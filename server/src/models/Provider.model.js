/**
 * @file Provider.model.js
 * @description Healthcare providers for location intelligence features.
 * Features 2dsphere index for geo-proximity queries.
 */

const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['hospital', 'doctor', 'medical_store', 'laboratory', 'emergency_center', 'ambulance_service'],
    required: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
    coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true } // [lng, lat]
    }
  },
  phone: String,
  rating: { type: Number, default: 4.5 },
  reviewsCount: { type: Number, default: 12 },
  consultationFee: { type: Number, default: 0 }, // in cents (e.g. if doctor or clinic has fee)
  details: {
    type: Map,
    of: String
  }
}, { timestamps: true });

providerSchema.index({ 'address.coordinates': '2dsphere' });

const Provider = mongoose.model('Provider', providerSchema);
module.exports = Provider;
