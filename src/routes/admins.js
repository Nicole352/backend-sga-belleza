const express = require('express');
const { createAdminController, listAdminsController } = require('../controllers/admins.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Crear nuevo administrador (solo superadmin)
router.post('/', authMiddleware, requireRole('superadmin'), createAdminController);

// Listar administradores (solo superadmin)
router.get('/', authMiddleware, requireRole('superadmin'), listAdminsController);

module.exports = router;
