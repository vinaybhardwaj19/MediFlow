const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { authorize }   = require('../middleware/rbac.middleware');
const {
  getDashboardStats, listUsers, toggleUserStatus, getAuditLogs,
} = require('../controllers/admin.controller');

router.use(verifyToken, authorize('admin'));

router.get ('/dashboard',       getDashboardStats);
router.get ('/users',           listUsers);
router.patch('/users/:id/status', toggleUserStatus);
router.get ('/audit-logs',      getAuditLogs);

module.exports = router;
