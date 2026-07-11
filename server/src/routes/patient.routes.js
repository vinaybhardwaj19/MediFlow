const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { authorize }   = require('../middleware/rbac.middleware');
const {
  getProfile, updateProfile, getMedicalHistory,
} = require('../controllers/patient.controller');

router.use(verifyToken);
router.get   ('/:id/profile',        authorize('patient','admin'), getProfile);
router.put   ('/:id/profile',        authorize('patient'),         updateProfile);
router.get   ('/:id/medical-history',authorize('patient','doctor','admin'), getMedicalHistory);

module.exports = router;
