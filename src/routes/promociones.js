const express = require('express');
const router = express.Router();
const promocionesController = require('../controllers/promociones.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');

// ============================================
// RUTAS PÚBLICAS (sin autenticación)
// ============================================
router.get('/activas', promocionesController.getActivas);
router.get('/activas/curso/:id_curso', promocionesController.getActivasByCurso);
router.get('/', promocionesController.getAll); // Sin auth, igual que /api/cursos

// ============================================
// MIDDLEWARE DE AUTENTICACIÓN
// ============================================
router.use(authMiddleware);

// ============================================
// RUTAS PROTEGIDAS - ESPECÍFICAS PRIMERO
// ============================================

// Estadísticas de promoción (admin) - DEBE IR ANTES de /:id
router.get('/:id/estadisticas', requireRole(['admin', 'administrativo']), promocionesController.getEstadisticas);

// Activar/Desactivar promoción (admin)
router.patch('/:id/toggle', requireRole(['admin', 'administrativo']), promocionesController.toggleActiva);

// Aceptar promoción (estudiantes)
router.post('/aceptar', requireRole(['estudiante']), promocionesController.aceptarPromocion);

// Obtener promoción por ID (cualquier usuario autenticado)
router.get('/:id', promocionesController.getById);

// Crear promoción (admin)
router.post('/', requireRole(['admin', 'administrativo']), promocionesController.create);

// Actualizar promoción (admin)
router.put('/:id', requireRole(['admin', 'administrativo']), promocionesController.update);

// Eliminar promoción (admin)
router.delete('/:id', requireRole(['admin', 'administrativo']), promocionesController.delete);

module.exports = router;
