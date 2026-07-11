/**
 * @file chat.controller.js
 * @description REST API for chat message history retrieval.
 * Used when a user re-opens a consultation to see past messages
 * (Socket also sends history on join, but this serves as a backup/pagination path).
 */

const ApiResponse  = require('../utils/ApiResponse');
const ApiError     = require('../utils/ApiError');
const ChatMessage  = require('../models/ChatMessage.model');
const Appointment  = require('../models/Appointment.model');

/**
 * GET /api/v1/chat/:roomId
 * Returns paginated chat messages for a consultation room.
 * Only appointment participants (patient/doctor) can access.
 */
exports.getChatHistory = async (req, res) => {
  const { roomId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  // Verify the requester is a participant of this room
  const appt = await Appointment.findOne({ 'consultationRoom.roomId': roomId });
  if (!appt) throw ApiError.notFound('Consultation room not found');

  const isPatient = appt.patientId.toString() === req.user.id;
  const isDoctor  = appt.doctorId.toString()  === req.user.id;
  const isAdmin   = req.user.role === 'admin';

  if (!isPatient && !isDoctor && !isAdmin) {
    throw ApiError.forbidden('You are not a participant in this consultation');
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [messages, total] = await Promise.all([
    ChatMessage.find({ roomId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    ChatMessage.countDocuments({ roomId }),
  ]);

  // Reverse so oldest-first for display
  messages.reverse();

  return ApiResponse.ok(res, messages, 'Chat history retrieved', {
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  });
};

/**
 * POST /api/v1/chat/:roomId/read
 * Mark messages as read by the current user.
 */
exports.markAsRead = async (req, res) => {
  const { roomId } = req.params;
  const { messageIds } = req.body;

  if (!Array.isArray(messageIds) || !messageIds.length) {
    throw ApiError.badRequest('messageIds array required');
  }

  const result = await ChatMessage.updateMany(
    { _id: { $in: messageIds }, roomId, senderId: { $ne: req.user.id } },
    { readAt: new Date() }
  );

  return ApiResponse.ok(res, { modified: result.modifiedCount }, 'Messages marked as read');
};
