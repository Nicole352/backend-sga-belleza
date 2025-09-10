const express = require('express');
const router = express.Router();
const { listRolesController } = require('../controllers/roles.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Solo superadmin puede listar roles
router.get('/', authMiddleware, requireRole('superadmin'), listRolesController);

module.exports = router;
