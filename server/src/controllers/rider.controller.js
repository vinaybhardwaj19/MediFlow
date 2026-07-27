/**
 * @file rider.controller.js
 * @description Controller for the Rider delivery dashboard, routes, and actions.
 */

const Order = require('../models/Order.model');
const RiderDelivery = require('../models/RiderDelivery.model');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');

/**
 * GET /api/v1/riders/queue
 * Get all orders waiting to be claimed by a rider.
 */
exports.getAvailableDeliveries = async (req, res) => {
  // Find orders where status is 'confirmed' or 'packed'
  const orders = await Order.find({
    currentStatus: { $in: ['confirmed', 'packed'] }
  }).populate('patientId', 'firstName lastName phone');

  // Filter out orders that already have an active rider delivery assignment
  const activeAssignments = await RiderDelivery.find({
    status: { $ne: 'delivered' }
  });
  const assignedOrderIds = new Set(activeAssignments.map(a => a.orderId.toString()));

  const unassignedOrders = orders.filter(o => !assignedOrderIds.has(o._id.toString()));

  return ApiResponse.ok(res, unassignedOrders, 'Available deliveries retrieved.');
};

/**
 * POST /api/v1/riders/accept
 * Claim an order for delivery.
 */
exports.acceptDelivery = async (req, res) => {
  const { orderId } = req.body;
  const riderId = req.user.id; // From verifyToken

  if (!orderId) {
    throw ApiError.badRequest('OrderId is required.');
  }

  // Check if order exists
  const order = await Order.findById(orderId).populate('patientId');
  if (!order) {
    throw ApiError.notFound('Order not found.');
  }

  // Check if already claimed
  const existing = await RiderDelivery.findOne({ orderId, status: { $ne: 'delivered' } });
  if (existing) {
    throw ApiError.badRequest('This order has already been claimed by another rider.');
  }

  // Generate 4-digit OTP code
  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

  const delivery = await RiderDelivery.create({
    riderId,
    orderId,
    status: 'assigned',
    otpCode,
    earnings: 15000 // 150.00 INR flat rate
  });

  // Update order status to 'dispatched'
  order.currentStatus = 'dispatched';
  order.trackingStatus.push({
    status: 'dispatched',
    note: 'Delivery agent assigned and preparing for pickup.'
  });
  await order.save();

  // Send Twilio SMS to patient about delivery dispatch and OTP
  if (order.patientId && order.patientId.phone) {
    const { sendSMS } = require('../utils/twilio');
    const ptName = `${order.patientId.firstName} ${order.patientId.lastName}`;
    const smsMsg = `Hello ${ptName}, your MediFlow pharmacy order is dispatched! A delivery agent has been assigned. Please share this verification code to confirm drop-off: ${otpCode}`;
    sendSMS(order.patientId.phone, smsMsg).catch(err => console.error('[Rider SMS] Error sending SMS in background:', err));
  }

  return ApiResponse.created(res, { delivery, otpCode }, 'Delivery accepted successfully.');
};

/**
 * POST /api/v1/riders/update-status
 * Update the delivery progress.
 */
exports.updateDeliveryStatus = async (req, res) => {
  const { deliveryId, status } = req.body;
  const riderId = req.user.id;

  if (!deliveryId || !status) {
    throw ApiError.badRequest('deliveryId and status are required.');
  }

  const validStatuses = ['assigned', 'picked_up', 'in_transit'];
  if (!validStatuses.includes(status)) {
    throw ApiError.badRequest('Invalid status. Use confirm-otp endpoint for setting status to delivered.');
  }

  const delivery = await RiderDelivery.findOne({ _id: deliveryId, riderId });
  if (!delivery) {
    throw ApiError.notFound('Delivery assignment not found or access denied.');
  }

  delivery.status = status;
  await delivery.save();

  // Map rider status to Order tracking status
  const orderStatusMap = {
    'picked_up': 'dispatched',
    'in_transit': 'in_transit'
  };

  const mappedStatus = orderStatusMap[status];
  if (mappedStatus) {
    const order = await Order.findById(delivery.orderId);
    if (order) {
      order.currentStatus = mappedStatus;
      order.trackingStatus.push({
        status: mappedStatus,
        note: `Order is ${status.replace('_', ' ')}.`
      });
      await order.save();
    }
  }

  return ApiResponse.ok(res, delivery, `Delivery status updated to ${status}.`);
};

/**
 * POST /api/v1/riders/confirm-otp
 * Verify OTP to complete the delivery.
 */
exports.confirmDeliveryOTP = async (req, res) => {
  const { deliveryId, otp } = req.body;
  const riderId = req.user.id;

  if (!deliveryId || !otp) {
    throw ApiError.badRequest('deliveryId and otp code are required.');
  }

  const delivery = await RiderDelivery.findOne({ _id: deliveryId, riderId });
  if (!delivery) {
    throw ApiError.notFound('Delivery assignment not found or access denied.');
  }

  if (delivery.status === 'delivered') {
    throw ApiError.badRequest('Delivery already completed.');
  }

  if (delivery.otpCode !== otp) {
    throw ApiError.badRequest('Invalid OTP code. Please verify with the patient.');
  }

  // Update delivery
  delivery.status = 'delivered';
  delivery.completedAt = new Date();
  await delivery.save();

  // Update order
  const order = await Order.findById(delivery.orderId);
  if (order) {
    order.currentStatus = 'delivered';
    order.paymentStatus = 'paid'; // Assumes cash/wallet collected or already paid
    order.trackingStatus.push({
      status: 'delivered',
      note: 'Package handed over and verified via OTP.'
    });
    await order.save();
  }

  return ApiResponse.ok(res, delivery, 'Delivery verified and completed successfully.');
};

/**
 * GET /api/v1/riders/stats
 * Retrieve income and delivery stats for the rider.
 */
exports.getRiderStats = async (req, res) => {
  const riderId = req.user.id;

  const deliveries = await RiderDelivery.find({ riderId, status: 'delivered' });
  const totalCompleted = deliveries.length;
  
  const totalEarnings = deliveries.reduce((sum, d) => sum + d.earnings, 0);

  const active = await RiderDelivery.find({
    riderId,
    status: { $in: ['assigned', 'picked_up', 'in_transit'] }
  }).populate({
    path: 'orderId',
    populate: { path: 'patientId', select: 'firstName lastName phone' }
  });

  return ApiResponse.ok(res, {
    totalCompleted,
    totalEarnings, // in cents
    activeRuns: active
  }, 'Rider stats retrieved.');
};

/**
 * GET /api/v1/riders/route/:deliveryId
 * Fetch real driving route geometry from OpenRouteService.
 */
exports.getDeliveryRoute = async (req, res) => {
  const { deliveryId } = req.params;
  const riderId = req.user.id;

  const delivery = await RiderDelivery.findOne({ _id: deliveryId, riderId }).populate({
    path: 'orderId',
    populate: { path: 'pharmacyId' }
  });

  if (!delivery) {
    throw ApiError.notFound('Delivery assignment not found or access denied.');
  }

  const order = delivery.orderId;
  if (!order) {
    throw ApiError.notFound('Associated order not found.');
  }

  // Pharmacy coordinates (default to Ludhiana pharmacy coordinates if not available or matches Bengaluru)
  let startCoords = [75.8573, 30.9010]; // Ludhiana pharmacy [lng, lat]
  
  if (order.pharmacyId && order.pharmacyId.address && order.pharmacyId.address.coordinates) {
    const coords = order.pharmacyId.address.coordinates;
    if (Array.isArray(coords)) {
      startCoords = coords; // standard geojson [lng, lat]
    } else if (coords.coordinates && Array.isArray(coords.coordinates)) {
      startCoords = coords.coordinates;
    } else if (coords.lat && coords.lng) {
      startCoords = [coords.lng, coords.lat];
    }
  } else {
    const city = order.deliveryAddress?.city?.toLowerCase() || '';
    if (city.includes('bengaluru') || city.includes('bangalore')) {
      startCoords = [77.5946, 12.9716]; // Bengaluru pharmacy [lng, lat]
    }
  }

  // Patient destination coords
  const destCoords = order.deliveryAddress?.coordinates
    ? [order.deliveryAddress.coordinates.lng, order.deliveryAddress.coordinates.lat] // [lng, lat]
    : [75.8400, 30.8850];

  const fallbackRoute = [
    [startCoords[1], startCoords[0]], // [lat, lng]
    [startCoords[1] - 0.0025, startCoords[0] - 0.0023],
    [startCoords[1] - 0.006, startCoords[0] - 0.0073],
    [startCoords[1] - 0.011, startCoords[0] - 0.0123],
    [destCoords[1], destCoords[0]] // [lat, lng]
  ];

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return ApiResponse.ok(res, {
      source: 'fallback',
      coordinates: fallbackRoute
    });
  }

  try {
    const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify({
        coordinates: [
          startCoords,
          destCoords
        ]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const coords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]); // Swap [lng, lat] to [lat, lng] for Leaflet
      return ApiResponse.ok(res, {
        source: 'openrouteservice',
        coordinates: coords
      });
    } else {
      const errDetails = await response.json().catch(() => ({}));
      console.error('[ORS Router] API error:', response.status, errDetails);
    }
  } catch (err) {
    console.error('[ORS Router] Error calling OpenRouteService API:', err);
  }

  return ApiResponse.ok(res, {
    source: 'fallback',
    coordinates: fallbackRoute
  });
};
