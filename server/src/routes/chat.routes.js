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

router.use(verifyToken); // All chat routes require authentication

router.get('/:roomId', chatCtrl.getChatHistory);
router.post('/:roomId/read', chatCtrl.markAsRead);

module.exports = router;
