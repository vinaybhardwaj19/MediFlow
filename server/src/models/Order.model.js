/**
 * @file Order.model.js
 * @description Customer pharmacy purchase transaction.
 * routingPath stores the ordered waypoint IDs produced by the Dijkstra engine.
 * trackingStatus is an append-only array (no element deletion allowed).
 */

const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  medicineId   : { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  medicineName : String,
  quantity     : { type: Number, min: 1, required: true },
  unitPrice    : { type: Number, min: 0, required: true }, // USD cents
  subtotal     : { type: Number, min: 0, required: true },
}, { _id: false });

const trackingEventSchema = new mongoose.Schema({
  status    : {
    type: String,
    enum: ['placed','confirmed','packed','dispatched','in_transit','delivered','failed'],
    required: true,
  },
  timestamp : { type: Date, default: Date.now },
  note      : String,
}, { _id: false });

const orderSchema = new mongoose.Schema({
  patientId      : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  prescriptionId : { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
  pharmacyId     : { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  items          : { type: [orderItemSchema], required: true },
  totalAmount    : { type: Number, min: 0, required: true }, // USD cents
  deliveryAddress: {
    street      : String,
    city        : String,
    coordinates : { lat: Number, lng: Number },
  },
  routingPath      : [{ type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy' }],
  estimatedDelivery: Date,
  trackingStatus   : { type: [trackingEventSchema], default: [] },
  currentStatus    : {
    type   : String,
    enum   : ['placed','confirmed','packed','dispatched','in_transit','delivered','failed'],
    default: 'placed',
    index  : true,
  },
  paymentMethod    : { type: String, enum: ['card','insurance','wallet','cod'] },
  paymentStatus    : { type: String, enum: ['pending','paid','refunded'], default: 'pending' },
}, { timestamps: true });

orderSchema.index({ patientId: 1, createdAt: -1 });
orderSchema.index({ pharmacyId: 1 });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
