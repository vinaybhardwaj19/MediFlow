/**
 * @file chat.routes.js
 * @description REST routes for consultation chat history.
 *
 * GET  /api/v1/chat/:roomId       → Paginated chat history (auth required)
 * POST /api/v1/chat/:roomId/read  → Mark messages as read
 */

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const chatCtrl = require('../controllers/chat.controller');

const router = Router();

// MediBot — open AI chat (no auth required for demo accessibility)
router.post('/medibot', chatCtrl.medibotChat);

// Authenticated consultation chat routes
router.use(verifyToken);
router.get('/:roomId', chatCtrl.getChatHistory);
router.post('/:roomId/read', chatCtrl.markAsRead);

module.exports = router;

