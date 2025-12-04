const express = require('express');
const estudiantesController = require('../controllers/estudiantes.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { pollingLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// POST /api/estudiantes/crear-desde-solicitud
// Solo administrativos pueden procesar solicitudes
router.post('/crear-desde-solicitud', authMiddleware, requireRole(['admin', 'administrativo', 'superadmin']), estudiantesController.createEstudianteFromSolicitud);

// GET /api/estudiantes/verificar - Verificar si estudiante existe por identificación
// PÚBLICO (con Rate Limit): Necesario para el formulario de inscripción
router.get('/verificar', pollingLimiter, estudiantesController.verificarEstudiante);

// GET /api/estudiantes/reporte/excel - Generar reporte Excel
// Solo administrativos
router.get('/reporte/excel', authMiddleware, requireRole(['admin', 'administrativo', 'superadmin']), estudiantesController.generarReporteExcel);

// GET /api/estudiantes - Obtener todos los estudiantes
// Solo administrativos
router.get('/', authMiddleware, requireRole(['admin', 'administrativo', 'superadmin']), estudiantesController.getEstudiantes);

// GET /api/estudiantes/mis-cursos - Obtener cursos matriculados del estudiante autenticado
// Estudiante autenticado (cualquier rol con token válido)
router.get('/mis-cursos', authMiddleware, estudiantesController.getMisCursos);

// GET /api/estudiantes/historial-academico - Obtener historial académico (cursos activos y finalizados)
// Estudiante autenticado
router.get('/historial-academico', authMiddleware, estudiantesController.getHistorialAcademico);

// GET /api/estudiantes/mis-pagos-mensuales - Obtener pagos mensuales del estudiante autenticado
// Estudiante autenticado
router.get('/mis-pagos-mensuales', authMiddleware, estudiantesController.getMisPagosMenuales);

// GET /api/estudiantes/:id - Obtener estudiante por ID
// Solo administrativos (para ver detalles de cualquier estudiante)
router.get('/:id', authMiddleware, requireRole(['admin', 'administrativo', 'superadmin']), estudiantesController.getEstudianteById);

// PUT /api/estudiantes/:id - Actualizar estudiante
// Solo administrativos
router.put('/:id', authMiddleware, requireRole(['admin', 'administrativo', 'superadmin']), estudiantesController.updateEstudiante);

// GET /api/estudiantes/debug-recientes - Ver estudiantes recientes (TEMPORAL)
// Solo administrativos
router.get('/debug-recientes', authMiddleware, requireRole(['admin', 'administrativo', 'superadmin']), estudiantesController.getEstudiantesRecientes);

module.exports = router;
