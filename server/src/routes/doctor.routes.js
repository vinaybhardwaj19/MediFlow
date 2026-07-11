const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { authorize }   = require('../middleware/rbac.middleware');
const {
  listDoctors, getDoctorById, getDoctorSlots, updateDoctorProfile,
} = require('../controllers/doctor.controller');

// Public — anyone can browse doctors
router.get('/',          listDoctors);
router.get('/:id',       getDoctorById);
router.get('/:id/slots', getDoctorSlots);

// Protected
router.put('/:id', verifyToken, authorize('doctor','admin'), updateDoctorProfile);

module.exports = router;
