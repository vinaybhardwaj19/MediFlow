/**
 * @file ChatMessage.model.js
 * @description Persistent chat message model for real-time consultation messaging.
 * Stores all messages exchanged between patient and doctor during a consultation room session.
 * Supports text, file, image, and system message types with read tracking.
 */

const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  senderName: {
    type: String,
    required: true,
    trim: true,
  },
  senderRole: {
    type: String,
    enum: ['patient', 'doctor', 'system'],
    required: true,
  },
  type: {
    type: String,
    enum: ['text', 'file', 'image', 'system'],
    default: 'text',
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000,
  },
  fileName: {
    type: String,          // Original filename for file/image messages
    trim: true,
  },
  fileSize: {
    type: Number,          // File size in bytes
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage',    // Thread support — reply to a specific message
  },
  readAt: {
    type: Date,            // null until the recipient reads the message
    default: null,
  },
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String,
  }],
}, { timestamps: true });

// Compound index for efficient room-based queries sorted by time
chatMessageSchema.index({ roomId: 1, createdAt: 1 });
// TTL: auto-delete messages older than 90 days for HIPAA compliance
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
module.exports = ChatMessage;
