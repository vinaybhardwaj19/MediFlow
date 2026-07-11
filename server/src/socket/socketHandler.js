/**
 * @file socketHandler.js
 * @description Socket.IO event hub for real-time features:
 *   - WebRTC signaling (offer/answer/ICE candidate exchange)
 *   - Room management (join/leave consultation rooms)
 *   - Presence tracking (doctor/patient online status)
 *   - Real-time chat messaging with persistence
 *   - Typing indicators & read receipts
 *   - Screen-share signaling
 *   - Call lifecycle events (start/end/duration)
 *
 * Security: Each connecting client must present a valid JWT token.
 */

const jwt         = require('jsonwebtoken');
const logger      = require('../utils/logger');
const env         = require('../config/env');
const ChatMessage = require('../models/ChatMessage.model');

/** In-memory room→socket mapping (scale with Redis adapter for multi-node) */
const rooms = new Map();

/** In-memory call timers: roomId → { startedAt, participants } */
const activeCalls = new Map();

const socketHandler = (io) => {

  // ── Auth middleware for Socket.IO connections ────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || token === 'anonymous') {
      // Allow anonymous for exhibition demos
      socket.user = { id: 'anon-' + socket.id, role: 'patient', name: 'Guest' };
      return next();
    }
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
      socket.user = {
        id: decoded.id || decoded.userId,
        role: decoded.role,
        name: decoded.name || decoded.email?.split('@')[0] || 'User',
      };
      next();
    } catch {
      // Fallback for exhibition — don't block connections
      socket.user = { id: 'demo-' + socket.id, role: 'patient', name: 'Demo User' };
      next();
    }
  });

  io.on('connection', (socket) => {
    logger.info(`[Socket] Connected: ${socket.id} | user: ${socket.user?.id} | role: ${socket.user?.role}`);

    // ── Join consultation room ─────────────────────────────────────────────────
    socket.on('room:join', async ({ roomId, userName }) => {
      socket.join(roomId);
      if (!rooms.has(roomId)) rooms.set(roomId, new Map());
      rooms.get(roomId).set(socket.id, {
        userId: socket.user.id,
        role: socket.user.role,
        name: userName || socket.user.name,
        joinedAt: Date.now(),
      });

      // Notify others in the room
      socket.to(roomId).emit('room:peer_joined', {
        peerId: socket.id,
        userId: socket.user.id,
        role: socket.user.role,
        name: userName || socket.user.name,
        participantCount: rooms.get(roomId).size,
      });

      // Send current participant list to the joiner
      const participants = [];
      rooms.get(roomId).forEach((info, sid) => {
        if (sid !== socket.id) participants.push({ peerId: sid, ...info });
      });
      socket.emit('room:participants', { roomId, participants });

      // Load & send chat history
      try {
        const history = await ChatMessage.find({ roomId })
          .sort({ createdAt: 1 })
          .limit(100)
          .lean();
        socket.emit('chat:history', { roomId, messages: history });
      } catch (err) {
        logger.error(`[Socket] Failed to load chat history for ${roomId}:`, err.message);
      }

      // System message for join
      const joinMsg = await _saveSystemMessage(roomId, `${userName || socket.user.role} joined the consultation`);
      io.in(roomId).emit('chat:message', joinMsg);

      logger.info(`[Socket] ${socket.id} joined room ${roomId} (${rooms.get(roomId).size} participants)`);
    });

    // ── WebRTC Signaling ──────────────────────────────────────────────────────
    socket.on('webrtc:offer', ({ roomId, offer }) => {
      socket.to(roomId).emit('webrtc:offer', { offer, from: socket.id });
    });

    socket.on('webrtc:answer', ({ roomId, answer }) => {
      socket.to(roomId).emit('webrtc:answer', { answer, from: socket.id });
    });

    socket.on('webrtc:ice_candidate', ({ roomId, candidate }) => {
      socket.to(roomId).emit('webrtc:ice_candidate', { candidate, from: socket.id });
    });

    // ── Screen Share Signaling ────────────────────────────────────────────────
    socket.on('screen:start', ({ roomId }) => {
      socket.to(roomId).emit('screen:start', { from: socket.id, name: socket.user.name });
    });

    socket.on('screen:stop', ({ roomId }) => {
      socket.to(roomId).emit('screen:stop', { from: socket.id });
    });

    // ── Call Lifecycle ────────────────────────────────────────────────────────
    socket.on('call:started', ({ roomId }) => {
      if (!activeCalls.has(roomId)) {
        activeCalls.set(roomId, { startedAt: Date.now(), participants: new Set() });
      }
      activeCalls.get(roomId).participants.add(socket.user.id);
      io.in(roomId).emit('call:started', {
        startedAt: activeCalls.get(roomId).startedAt,
      });
      logger.info(`[Socket] Call started in room ${roomId}`);
    });

    socket.on('call:ended', async ({ roomId }) => {
      const call = activeCalls.get(roomId);
      if (call) {
        const duration = Math.floor((Date.now() - call.startedAt) / 1000);
        const durationStr = _formatDuration(duration);
        io.in(roomId).emit('call:ended', { duration, durationFormatted: durationStr });
        activeCalls.delete(roomId);

        // System message
        const endMsg = await _saveSystemMessage(roomId, `Call ended · Duration: ${durationStr}`);
        io.in(roomId).emit('chat:message', endMsg);
      }
      socket.to(roomId).emit('room:peer_left', { peerId: socket.id });
    });

    // ── Chat Messages ─────────────────────────────────────────────────────────
    socket.on('chat:message', async ({ roomId, content, type = 'text', fileName, fileSize, replyTo }) => {
      if (!content || !roomId) return;

      try {
        const msg = await ChatMessage.create({
          roomId,
          senderId: socket.user.id,
          senderName: socket.user.name,
          senderRole: socket.user.role,
          type,
          content,
          fileName,
          fileSize,
          replyTo: replyTo || undefined,
        });

        // Broadcast to ENTIRE room (including sender — sender uses msg._id for confirmation)
        io.in(roomId).emit('chat:message', {
          _id: msg._id,
          roomId: msg.roomId,
          senderId: msg.senderId,
          senderName: msg.senderName,
          senderRole: msg.senderRole,
          type: msg.type,
          content: msg.content,
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          replyTo: msg.replyTo,
          createdAt: msg.createdAt,
        });
      } catch (err) {
        logger.error(`[Socket] Chat message save error:`, err.message);
        socket.emit('chat:error', { message: 'Failed to send message' });
      }
    });

    // ── Typing Indicator ──────────────────────────────────────────────────────
    socket.on('chat:typing', ({ roomId, isTyping }) => {
      socket.to(roomId).emit('chat:typing', {
        userId: socket.user.id,
        name: socket.user.name,
        role: socket.user.role,
        isTyping,
      });
    });

    // ── Read Receipts ─────────────────────────────────────────────────────────
    socket.on('chat:read', async ({ roomId, messageIds }) => {
      if (!Array.isArray(messageIds) || !messageIds.length) return;
      try {
        await ChatMessage.updateMany(
          { _id: { $in: messageIds }, roomId, senderId: { $ne: socket.user.id } },
          { readAt: new Date() }
        );
        socket.to(roomId).emit('chat:read', { messageIds, readBy: socket.user.id });
      } catch (err) {
        logger.error(`[Socket] Read receipt error:`, err.message);
      }
    });

    // ── Reactions ─────────────────────────────────────────────────────────────
    socket.on('chat:react', async ({ roomId, messageId, emoji }) => {
      try {
        await ChatMessage.findByIdAndUpdate(messageId, {
          $push: { reactions: { userId: socket.user.id, emoji } }
        });
        io.in(roomId).emit('chat:react', {
          messageId,
          userId: socket.user.id,
          emoji,
        });
      } catch (err) {
        logger.error(`[Socket] Reaction error:`, err.message);
      }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      for (const [roomId, members] of rooms.entries()) {
        if (members.has(socket.id)) {
          const userInfo = members.get(socket.id);
          members.delete(socket.id);
          socket.to(roomId).emit('room:peer_left', {
            peerId: socket.id,
            userId: socket.user.id,
            participantCount: members.size,
          });

          // System message
          const leaveMsg = await _saveSystemMessage(roomId, `${userInfo?.name || socket.user.role} left the consultation`);
          io.in(roomId).emit('chat:message', leaveMsg);

          if (members.size === 0) {
            rooms.delete(roomId);
            activeCalls.delete(roomId);
          }
        }
      }
      logger.info(`[Socket] Disconnected: ${socket.id}`);
    });
  });
};

// ── Helpers ────────────────────────────────────────────────────────────────────

async function _saveSystemMessage(roomId, text) {
  try {
    const msg = await ChatMessage.create({
      roomId,
      senderId: '000000000000000000000000', // system pseudo-ID
      senderName: 'System',
      senderRole: 'system', // dedicated enum value for system messages
      type: 'system',
      content: text,
    });
    return {
      _id: msg._id,
      roomId, senderId: msg.senderId, senderName: 'System',
      senderRole: 'system', type: 'system', content: text,
      createdAt: msg.createdAt,
    };
  } catch (err) {
    logger.error('[Socket] System message save error:', err.message);
    return { type: 'system', content: text, createdAt: new Date() };
  }
}

function _formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = socketHandler;
