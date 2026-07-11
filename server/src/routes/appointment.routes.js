/**
 * @file appointment.routes.js — Phase 2: validation wired in
 */
const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { authorize }   = require('../middleware/rbac.middleware');
const { validate }    = require('../middleware/validate.middleware');
const schemas         = require('../utils/validators');
const {
  bookAppointment, getAppointment, listAppointments,
  updateAppointmentStatus, cancelAppointment, getConsultationToken,
} = require('../controllers/appointment.controller');

router.use(verifyToken);
router.post ('/',              authorize('patient'),                  validate(schemas.appointment.book),         bookAppointment);
router.get  ('/',              authorize('patient','doctor','admin'),  listAppointments);
router.get  ('/:id',           authorize('patient','doctor','admin'),  getAppointment);
router.patch('/:id/status',    authorize('doctor','admin'),           validate(schemas.appointment.updateStatus), updateAppointmentStatus);
router.patch('/:id/cancel',    authorize('patient','doctor','admin'),  validate(schemas.appointment.cancel),       cancelAppointment);
router.get  ('/:id/room-token',authorize('patient','doctor'),         getConsultationToken);

module.exports = router;
