const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { authorize }   = require('../middleware/rbac.middleware');
const {
  getDashboardStats, listUsers, toggleUserStatus, getAuditLogs,
} = require('../controllers/admin.controller');

router.get ('/dashboard',       verifyToken, authorize('admin', 'worker'), getDashboardStats);
router.get ('/users',           verifyToken, authorize('admin', 'worker'), listUsers);
router.patch('/users/:id/status', verifyToken, authorize('admin'), toggleUserStatus);
router.patch('/users/:id/verify', verifyToken, authorize('admin'), (req, res, next) => {
  const { verifyUser } = require('../controllers/admin.controller');
  verifyUser(req, res, next);
});
router.get ('/audit-logs',      verifyToken, authorize('admin', 'worker'), getAuditLogs);

module.exports = router;
