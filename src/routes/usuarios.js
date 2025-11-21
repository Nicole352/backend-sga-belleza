const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { authMiddleware } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// ========================================
// RUTAS DE PERFIL PROPIO
// ========================================

// PUT /api/usuarios/mi-perfil - Actualizar perfil propio
router.put('/mi-perfil', usuariosController.actualizarMiPerfil);

// PUT /api/usuarios/cambiar-password - Cambiar contraseña propia
router.put('/cambiar-password', usuariosController.cambiarMiPassword);

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

// ========================================
// RUTAS DE FOTO DE PERFIL
// ========================================

// PUT /api/usuarios/:id/foto-perfil - Subir/actualizar foto de perfil
router.put('/:id/foto-perfil', upload.single('foto'), handleMulterError, usuariosController.subirFotoPerfil);

// GET /api/usuarios/:id/foto-perfil - Obtener foto de perfil
router.get('/:id/foto-perfil', usuariosController.obtenerFotoPerfil);

// DELETE /api/usuarios/:id/foto-perfil - Eliminar foto de perfil
router.delete('/:id/foto-perfil', usuariosController.eliminarFotoPerfil);

// ========================================
// RUTAS DE BLOQUEO DE CUENTAS
// ========================================

// POST /api/usuarios/:id/bloquear - Bloquear cuenta de usuario
router.post('/:id/bloquear', usuariosController.bloquearCuenta);

// POST /api/usuarios/:id/desbloquear - Desbloquear cuenta de usuario
router.post('/:id/desbloquear', usuariosController.desbloquearCuenta);

module.exports = router;
