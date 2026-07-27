/**
 * @file RiderDelivery.model.js
 * @description Delivery details for pharmacy orders handled by riders.
 */

const mongoose = require('mongoose');

const riderDeliverySchema = new mongoose.Schema({
  riderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  status: {
    type: String,
    enum: ['assigned', 'picked_up', 'in_transit', 'delivered'],
    default: 'assigned',
    index: true
  },
  otpCode: { type: String, required: true },
  earnings: { type: Number, default: 15000 }, // INR cents (e.g. 150.00 INR)
  completedAt: { type: Date }
}, { timestamps: true });

const RiderDelivery = mongoose.model('RiderDelivery', riderDeliverySchema);
module.exports = RiderDelivery;
