/**
 * @file prescription.routes.js
 * @description Prescription CRUD endpoints.
 *
 * POST   /api/v1/prescriptions               — Doctor creates prescription
 * GET    /api/v1/prescriptions/:id           — View single prescription (owner/doctor/admin)
 * GET    /api/v1/prescriptions/patient/:pid  — List patient's prescription history
 * PATCH  /api/v1/prescriptions/:id/status   — Update status (pharmacist/admin)
 */

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { authorize }   = require('../middleware/rbac.middleware');
const { validate }    = require('../middleware/validate.middleware');
const schemas         = require('../utils/validators');
const {
  createPrescription, getPrescription,
  listPatientPrescriptions, updatePrescriptionStatus,
} = require('../controllers/prescription.controller');

router.use(verifyToken);

router.post ('/',
  authorize('doctor'),
  validate(schemas.prescription.create),
  createPrescription
);

router.get ('/:id',
  authorize('patient','doctor','pharmacist','admin'),
  getPrescription
);

router.get ('/patient/:patientId',
  authorize('patient','doctor','admin'),
  listPatientPrescriptions
);

router.patch('/:id/status',
  authorize('pharmacist','admin'),
  updatePrescriptionStatus
);

module.exports = router;
