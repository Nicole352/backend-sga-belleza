const express = require('express');
const estudiantesController = require('../controllers/estudiantes.controller');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/estudiantes/crear-desde-solicitud
router.post('/crear-desde-solicitud', estudiantesController.createEstudianteFromSolicitud);

// GET /api/estudiantes - Obtener todos los estudiantes
router.get('/', estudiantesController.getEstudiantes);

// GET /api/estudiantes/mis-cursos - Obtener cursos matriculados del estudiante autenticado
router.get('/mis-cursos', authMiddleware, estudiantesController.getMisCursos);

// GET /api/estudiantes/:id - Obtener estudiante por ID
router.get('/:id', estudiantesController.getEstudianteById);

// PUT /api/estudiantes/:id - Actualizar estudiante
router.put('/:id', estudiantesController.updateEstudiante);

// GET /api/estudiantes/debug-recientes - Ver estudiantes recientes (TEMPORAL)
router.get('/debug-recientes', estudiantesController.getEstudiantesRecientes);

module.exports = router;
