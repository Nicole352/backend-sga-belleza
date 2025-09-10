const express = require('express');
const {
  listCursosController,
  getCursoController,
  createCursoController,
  updateCursoController,
  deleteCursoController,
  getTiposCursosController,
  getAulasController,
  asignarDocenteController,
  desasignarDocenteController,
  getEstadisticasController
} = require('../controllers/cursos.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Rutas públicas (sin autenticación)
// GET /api/cursos - Listar cursos con filtros
router.get('/', listCursosController);

// GET /api/cursos/:id - Obtener curso específico
router.get('/:id', getCursoController);

// Rutas que requieren autenticación
// GET /api/cursos/tipos - Obtener tipos de cursos
router.get('/tipos', authMiddleware, getTiposCursosController);

// GET /api/cursos/aulas - Obtener aulas disponibles
router.get('/aulas', authMiddleware, getAulasController);

// GET /api/cursos/estadisticas - Obtener estadísticas
router.get('/estadisticas', authMiddleware, requireRole('administrativo', 'superadmin'), getEstadisticasController);

// Rutas que requieren permisos administrativos
// POST /api/cursos - Crear nuevo curso
router.post('/', authMiddleware, requireRole('administrativo', 'superadmin'), createCursoController);

// PUT /api/cursos/:id - Actualizar curso
router.put('/:id', authMiddleware, requireRole('administrativo', 'superadmin'), updateCursoController);

// DELETE /api/cursos/:id - Eliminar curso
router.delete('/:id', authMiddleware, requireRole('administrativo', 'superadmin'), deleteCursoController);

// POST /api/cursos/:id/docentes - Asignar docente a curso
router.post('/:id/docentes', authMiddleware, requireRole('administrativo', 'superadmin'), asignarDocenteController);

// DELETE /api/cursos/:id/docentes/:docente_id - Desasignar docente de curso
router.delete('/:id/docentes/:docente_id', authMiddleware, requireRole('administrativo', 'superadmin'), desasignarDocenteController);

module.exports = router;