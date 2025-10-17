const express = require('express');
const { 
  listCursosController, 
  getCursosDisponiblesController, 
  getCursoController, 
  createCursoController, 
  updateCursoController, 
  deleteCursoController,
  getEstudiantesByCursoController,
  getTareasByCursoController,
  getCalificacionesByCursoController
} = require('../controllers/cursos.controller');

const { pollingLimiter, generalLimiter } = require('../middleware/rateLimit');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/cursos/disponibles - DEBE IR ANTES de /:id para evitar conflictos
router.get('/disponibles', generalLimiter, getCursosDisponiblesController);

// GET /api/cursos?estado=activo&tipo=<id_tipo_curso>&page=1&limit=10
router.get('/', generalLimiter, listCursosController);

// GET /api/cursos/:id - Con rate limiting para polling
router.get('/:id', pollingLimiter, getCursoController);

// ========================================
// Datos académicos por curso (protegidos)
// ========================================
router.get('/:id/estudiantes', authMiddleware, getEstudiantesByCursoController);
router.get('/:id/tareas', authMiddleware, getTareasByCursoController);
router.get('/:id/calificaciones', authMiddleware, getCalificacionesByCursoController);

// POST /api/cursos
router.post('/', authMiddleware, createCursoController);

// PUT /api/cursos/:id
router.put('/:id', authMiddleware, updateCursoController);

// DELETE /api/cursos/:id
router.delete('/:id', authMiddleware, deleteCursoController);

// Ruta de clonado eliminada

module.exports = router;