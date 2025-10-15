const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// ========================================
// RUTAS DE CONTROL DE USUARIOS
// ========================================

// GET /api/usuarios - Lista paginada con filtros
router.get('/', usuariosController.getUsuarios);

// GET /api/usuarios/stats - Estadísticas
router.get('/stats', usuariosController.getUsuariosStats);

// GET /api/usuarios/:id - Detalle de usuario
router.get('/:id', usuariosController.getUsuarioById);

// PUT /api/usuarios/:id/estado - Cambiar estado (activo/inactivo)
router.put('/:id/estado', usuariosController.cambiarEstado);

// POST /api/usuarios/:id/reset-password - Resetear contraseña
router.post('/:id/reset-password', usuariosController.resetPassword);

// GET /api/usuarios/:id/sesiones - Últimas sesiones del usuario
router.get('/:id/sesiones', usuariosController.getSesiones);

// GET /api/usuarios/:id/acciones - Últimas acciones del usuario
router.get('/:id/acciones', usuariosController.getAcciones);

module.exports = router;
