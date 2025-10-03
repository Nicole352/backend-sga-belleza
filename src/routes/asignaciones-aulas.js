const express = require('express');
const router = express.Router();
const asignacionesAulasController = require('../controllers/asignaciones-aulas.controller');

// Obtener todas las asignaciones (con filtros opcionales)
router.get('/', asignacionesAulasController.getAsignaciones);

// Obtener estadísticas
router.get('/estadisticas', asignacionesAulasController.getEstadisticas);

// Verificar disponibilidad de aula
router.get('/verificar-disponibilidad', asignacionesAulasController.verificarDisponibilidad);

// Obtener asignaciones por aula
router.get('/aula/:id_aula', asignacionesAulasController.getAsignacionesByAula);

// Obtener asignaciones por docente
router.get('/docente/:id_docente', asignacionesAulasController.getAsignacionesByDocente);

// Obtener asignación por ID
router.get('/:id', asignacionesAulasController.getAsignacionById);

// Crear nueva asignación
router.post('/', asignacionesAulasController.createAsignacion);

// Actualizar asignación
router.put('/:id', asignacionesAulasController.updateAsignacion);

// Eliminar asignación (soft delete)
router.delete('/:id', asignacionesAulasController.deleteAsignacion);

module.exports = router;
