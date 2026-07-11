/**
 * @file webrtc.service.js
 * @description WebRTC consultation room token management.
 *
 * Responsibilities:
 *   1. Generate ephemeral signaling JWTs (2hr TTL) for confirmed appointments.
 *   2. Verify signaling tokens presented by Socket.IO clients.
 *   3. Generate unique room IDs (UUID v4).
 *
 * The signaling token payload:
 *   { roomId, userId, role, appointmentId }
 *
 * Security note:
 *   Signaling tokens are signed with the same JWT_ACCESS_SECRET but carry
 *   a 2-hour TTL and a 'type: signaling' claim so they cannot be used as
 *   API access tokens (auth.middleware checks for that claim and rejects them).
 */

const jwt  = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const env  = require('../config/env');
const ApiError = require('../utils/ApiError');

const SIGNALING_TTL = '2h';

/**
 * Generate a new WebRTC room ID and its signaling token for both participants.
 * @param {object} p
 * @param {string} p.appointmentId
 * @param {string} p.patientId
 * @param {string} p.doctorId
 * @returns {{ roomId, patientToken, doctorToken }}
 */
function generateRoomTokens({ appointmentId, patientId, doctorId }) {
  const roomId = uuidv4();

  const base = { roomId, appointmentId, type: 'signaling' };

  const patientToken = jwt.sign(
    { ...base, userId: patientId.toString(), role: 'patient' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: SIGNALING_TTL }
  );

  const doctorToken = jwt.sign(
    { ...base, userId: doctorId.toString(), role: 'doctor' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: SIGNALING_TTL }
  );

  return { roomId, patientToken, doctorToken };
}

/**
 * Verify a signaling token and return its decoded payload.
 * Throws ApiError.unauthorized if invalid or expired.
 * @param {string} token
 * @returns {object} Decoded payload
 */
function verifySignalingToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (decoded.type !== 'signaling') {
      throw ApiError.unauthorized('Token is not a signaling token');
    }
    return decoded;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'TokenExpiredError')
      throw ApiError.unauthorized('Signaling token expired. Please rejoin from your appointment.');
    throw ApiError.unauthorized('Invalid signaling token');
  }
}

module.exports = { generateRoomTokens, verifySignalingToken };
