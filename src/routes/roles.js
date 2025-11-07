const express = require('express');
const router = express.Router();
const { listRolesController } = require('../controllers/roles.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Permitir acceso a superadmin/admin/administrativo para listar roles
router.get('/', authMiddleware, requireRole(['superadmin', 'admin', 'administrativo']), listRolesController);

module.exports = router;
