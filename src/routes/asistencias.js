const express = require('express');
const {
  getCursosDocenteController,
  getEstudiantesCursoController,
  getAsistenciaByFechaController,
  guardarAsistenciaController,
  getHistorialEstudianteController,
  getReporteCursoController
} = require('../controllers/asistencias.controller');

const { authMiddleware } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Obtener cursos que imparte un docente
router.get('/cursos-docente/:id_docente', authMiddleware, generalLimiter, getCursosDocenteController);

// Obtener estudiantes de un curso
router.get('/estudiantes/:id_curso', authMiddleware, generalLimiter, getEstudiantesCursoController);

// Obtener asistencia de un curso en una fecha específica
router.get('/curso/:id_curso/fecha/:fecha', authMiddleware, generalLimiter, getAsistenciaByFechaController);

// Obtener asistencias de un curso por rango de fechas
router.get('/curso/:id_curso/rango', authMiddleware, generalLimiter, getAsistenciaByFechaController);

// Guardar o actualizar asistencia (múltiples registros)
router.post('/', authMiddleware, generalLimiter, guardarAsistenciaController);

// Obtener historial de asistencia de un estudiante en un curso
router.get('/estudiante/:id_estudiante/curso/:id_curso', authMiddleware, generalLimiter, getHistorialEstudianteController);

// Obtener reporte completo de asistencia de un curso
router.get('/reporte/:id_curso', authMiddleware, generalLimiter, getReporteCursoController);

module.exports = router;
