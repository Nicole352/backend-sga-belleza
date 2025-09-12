const express = require('express');
const { listCursosController, getCursoController, createCursoController, updateCursoController, deleteCursoController, cloneCursoController } = require('../controllers/cursos.controller');
const { pollingLimiter, generalLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// GET /api/cursos?estado=activo&tipo=<id_tipo_curso>&page=1&limit=10
router.get('/', generalLimiter, listCursosController);

// GET /api/cursos/:id - Con rate limiting para polling
router.get('/:id', pollingLimiter, getCursoController);

// POST /api/cursos
router.post('/', createCursoController);

// PUT /api/cursos/:id
router.put('/:id', updateCursoController);

// DELETE /api/cursos/:id
router.delete('/:id', deleteCursoController);

// POST /api/cursos/:id/clone
router.post('/:id/clone', cloneCursoController);

module.exports = router;