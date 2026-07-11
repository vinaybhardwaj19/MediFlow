/**
 * @file pharmacy.controller.js — Phase 3: Dijkstra routing integrated
 */
const ApiResponse  = require('../utils/ApiResponse');
const ApiError     = require('../utils/ApiError');
const Medicine     = require('../models/Medicine.model');
const Pharmacy     = require('../models/Pharmacy.model');
const Order        = require('../models/Order.model');
const {
  calculateOptimalRoute,
  findBestSourcePharmacy,
  getTrafficMultiplier,
} = require('../services/routing.service');

// ── Medicine catalogue ────────────────────────────────────────────────────────

exports.searchMedicines = async (req, res) => {
  const { q, category, page = 1, limit = 20 } = req.query;
  const filter = { isActive: true };
  if (q)        filter.$text = { $search: q };
  if (category) filter.category = category;
  const [medicines, total] = await Promise.all([
    Medicine.find(filter).skip((page - 1) * limit).limit(Number(limit)),
    Medicine.countDocuments(filter),
  ]);
  return ApiResponse.ok(res, medicines, 'Medicines retrieved', { total, page: Number(page) });
};

exports.getMedicine = async (req, res) => {
  const med = await Medicine.findById(req.params.id);
  if (!med) throw ApiError.notFound('Medicine not found');
  return ApiResponse.ok(res, med);
};

// ── Pharmacy locations ─────────────────────────────────────────────────────────

exports.listPharmacies = async (req, res) => {
  const pharmacies = await Pharmacy.find({ isActive: true }).select('-inventory');
  return ApiResponse.ok(res, pharmacies);
};

exports.getNearbyPharmacies = async (req, res) => {
  const { lat, lng, radius = 10 } = req.query;
  if (!lat || !lng) throw ApiError.badRequest('lat and lng query params are required');

  const pharmacies = await Pharmacy.find({
    isActive: true,
    'address.coordinates': {
      $near: {
        $geometry   : { type: 'Point', coordinates: [Number(lng), Number(lat)] },
        $maxDistance: Number(radius) * 1000, // metres
      },
    },
  }).select('-inventory').limit(10);

  return ApiResponse.ok(res, pharmacies);
};

// ── Order placement with Dijkstra routing ─────────────────────────────────────

/**
 * POST /api/v1/pharmacy/orders
 *
 * Routing flow:
 *  1. Load all active pharmacies (needed for graph)
 *  2. Determine source pharmacy:
 *     - If patient specified pharmacyId → validate it has stock
 *     - Otherwise → findBestSourcePharmacy() auto-selects
 *  3. Determine target pharmacy (closest to delivery address)
 *  4. Run calculateOptimalRoute() → Dijkstra path
 *  5. Persist order with routingPath + estimatedDelivery
 */
exports.placeOrder = async (req, res) => {
  const {
    pharmacyId, items, deliveryAddress, prescriptionId, paymentMethod,
  } = req.body;

  const medicineIds = items.map((i) => i.medicineId);

  // ── Load all active pharmacies (graph nodes) ───────────────────────────────
  const allPharmacies = await Pharmacy.find({ isActive: true });
  if (!allPharmacies.length) throw ApiError.internal('No active pharmacies available');

  // ── Determine source (warehouse with stock) ────────────────────────────────
  let sourceId = pharmacyId;

  if (sourceId) {
    // Validate that the specified pharmacy is active
    const src = allPharmacies.find((p) => p._id.toString() === sourceId);
    if (!src) throw ApiError.badRequest('Specified pharmacy not found or inactive');
  } else {
    // Auto-select best source based on stock + proximity
    const patientCoords = deliveryAddress?.coordinates;
    if (!patientCoords) throw ApiError.badRequest('deliveryAddress.coordinates required when pharmacyId is omitted');
    sourceId = findBestSourcePharmacy(allPharmacies, patientCoords, medicineIds);
    if (!sourceId) throw ApiError.badRequest('No pharmacy in range with required stock');
  }

  // ── Determine target (pharmacy nearest to delivery address) ────────────────
  // For direct home delivery, sourceId === targetId (no intermediate hops)
  let targetId = sourceId;

  if (deliveryAddress?.coordinates) {
    const { lat, lng } = deliveryAddress.coordinates;
    // Find the closest pharmacy to the delivery point (as final waypoint)
    let minDist = Infinity;
    for (const p of allPharmacies) {
      const coords = p.address?.coordinates;
      if (!coords?.coordinates) continue;
      const [pLng, pLat] = coords.coordinates;
      const d = Math.hypot(pLat - lat, pLng - lng); // approx — Haversine used in routing
      if (d < minDist) { minDist = d; targetId = p._id.toString(); }
    }
  }

  // ── Run Dijkstra ───────────────────────────────────────────────────────────
  const { path, estimatedMinutes, trafficFactor, totalCostKm, hops } =
    calculateOptimalRoute({ pharmacies: allPharmacies, sourceId, targetId, medicineIds });

  // ── Calculate totals ───────────────────────────────────────────────────────
  const totalAmount     = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const estimatedDelivery = new Date(Date.now() + estimatedMinutes * 60 * 1000);

  // ── Persist order ──────────────────────────────────────────────────────────
  const order = await Order.create({
    patientId      : req.user.id,
    pharmacyId     : sourceId,
    prescriptionId,
    items,
    totalAmount,
    deliveryAddress,
    routingPath    : path,
    estimatedDelivery,
    paymentMethod,
    trackingStatus : [{ status: 'placed', timestamp: new Date() }],
    currentStatus  : 'placed',
  });

  return ApiResponse.created(res, {
    order,
    routingMeta: {
      path,
      totalCostKm,
      trafficFactor,
      estimatedMinutes,
      hops,
    },
  }, 'Order placed — optimal route calculated');
};

// ── Order queries ──────────────────────────────────────────────────────────────

exports.listOrders = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const filter = {};
  if (req.user.role === 'patient') filter.patientId = req.user.id;
  // Pharmacists and admins can see all orders
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit)),
    Order.countDocuments(filter),
  ]);
  return ApiResponse.ok(res, orders, 'Orders retrieved', { total, page: Number(page) });
};

exports.getOrder = async (req, res) => {
  const order = await Order.findById(req.params.id).populate('pharmacyId', 'name address');
  if (!order) throw ApiError.notFound('Order not found');
  return ApiResponse.ok(res, order);
};

exports.trackOrder = async (req, res) => {
  const order = await Order.findById(req.params.id)
    .select('trackingStatus currentStatus estimatedDelivery routingPath');
  if (!order) throw ApiError.notFound('Order not found');

  // Annotate with live traffic factor for real-time ETA recalculation
  return ApiResponse.ok(res, {
    ...order.toObject(),
    liveTrafficFactor: getTrafficMultiplier(),
  });
};
