/**
 * @file family.routes.js
 * @description Collaborative health circle endpoints.
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const {
  createCircle, inviteMember, getMyCircles, respondToInvite, getMemberVitals
} = require('../controllers/family.controller');

router.use(verifyToken);

router.post('/create', createCircle);
router.get('/circles', getMyCircles);
router.post('/invite/:familyId', inviteMember);
router.post('/respond/:familyId', respondToInvite);
router.get('/vitals/:userId', getMemberVitals);

module.exports = router;
