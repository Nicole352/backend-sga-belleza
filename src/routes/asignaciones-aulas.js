const express = require('express');
const router = express.Router();
const asignacionesAulasController = require('../controllers/asignaciones-aulas.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Aplicar autenticación a todas las rutas
router.use(authMiddleware);

// Obtener todas las asignaciones (con filtros opcionales) - todos los usuarios autenticados
router.get('/', asignacionesAulasController.getAsignaciones);

// Obtener estadísticas - todos los usuarios autenticados
router.get('/estadisticas', asignacionesAulasController.getEstadisticas);

// Verificar disponibilidad de aula - todos los usuarios autenticados
router.get('/verificar-disponibilidad', asignacionesAulasController.verificarDisponibilidad);

// Obtener asignaciones por aula - todos los usuarios autenticados
router.get('/aula/:id_aula', asignacionesAulasController.getAsignacionesByAula);

// Obtener asignaciones por docente - todos los usuarios autenticados
router.get('/docente/:id_docente', asignacionesAulasController.getAsignacionesByDocente);

// Obtener asignación por ID - todos los usuarios autenticados
router.get('/:id', asignacionesAulasController.getAsignacionById);

// Rutas de modificación: solo administrativos y superadmin
router.use(requireRole(['administrativo', 'superadmin']));

// Crear nueva asignación
router.post('/', asignacionesAulasController.createAsignacion);

// Actualizar asignación
router.put('/:id', asignacionesAulasController.updateAsignacion);

// Eliminar asignación (soft delete)
router.delete('/:id', asignacionesAulasController.deleteAsignacion);

module.exports = router;
