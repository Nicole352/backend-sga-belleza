const express = require('express');
const docentesController = require('../controllers/docentes.controller');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// GET /api/docentes - Obtener docentes con paginación y filtros
router.get('/', docentesController.getDocentes);

// GET /api/docentes/stats/general - Estadísticas de docentes (ANTES de /:id)
router.get('/stats/general', docentesController.getDocentesStats);

// ===== RUTAS PARA EL PANEL DEL DOCENTE (requieren autenticación) =====
// GET /api/docentes/mis-cursos - Obtener cursos ACTIVOS del docente autenticado
router.get('/mis-cursos', authMiddleware, docentesController.getMisCursos);

// GET /api/docentes/todos-mis-cursos - Obtener TODOS los cursos (activos y finalizados) del docente
router.get('/todos-mis-cursos', authMiddleware, docentesController.getTodosMisCursos);

// GET /api/docentes/mis-estudiantes - Obtener estudiantes del docente autenticado
router.get('/mis-estudiantes', authMiddleware, docentesController.getMisEstudiantes);

// GET /api/docentes/mi-horario - Obtener horario del docente autenticado
router.get('/mi-horario', authMiddleware, docentesController.getMiHorario);

// GET /api/docentes/:id - Obtener docente específico
router.get('/:id', docentesController.getDocenteById);

// POST /api/docentes - Crear nuevo docente
router.post('/', docentesController.createDocente);

// PUT /api/docentes/:id - Actualizar docente
router.put('/:id', docentesController.updateDocente);

// DELETE /api/docentes/:id - Eliminar docente (cambiar estado a inactivo)
router.delete('/:id', docentesController.deleteDocente);

module.exports = router;
