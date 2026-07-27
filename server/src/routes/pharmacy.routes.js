/**
 * @file pharmacy.routes.js — Phase 2: validation wired in
 */
const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { authorize }   = require('../middleware/rbac.middleware');
const { validate }    = require('../middleware/validate.middleware');
const schemas         = require('../utils/validators');
const {
  searchMedicines, getMedicine,
  listPharmacies, getNearbyPharmacies, getInventory,
  placeOrder, getOrder, trackOrder, listOrders,
} = require('../controllers/pharmacy.controller');

router.get('/medicines',         searchMedicines);
router.get('/medicines/:id',     getMedicine);
router.get('/pharmacies',        listPharmacies);
router.get('/pharmacies/nearby', getNearbyPharmacies);
router.get('/inventory',         verifyToken, authorize('pharmacist', 'admin', 'worker'), getInventory);

router.post('/orders',           verifyToken, authorize('patient'), validate(schemas.pharmacy.placeOrder), placeOrder);
router.get ('/orders',           verifyToken, authorize('patient','pharmacist','admin','worker'), listOrders);
router.get ('/orders/:id',       verifyToken, authorize('patient','pharmacist','admin','worker'), getOrder);
router.get ('/orders/:id/track', verifyToken, authorize('patient','pharmacist','admin','worker'), trackOrder);

module.exports = router;
