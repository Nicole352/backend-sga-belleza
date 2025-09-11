const express = require('express');
const { listCursosController, getCursoController } = require('../controllers/cursos.controller');

const router = express.Router();

// GET /api/cursos?estado=activo&tipo=<id_tipo_curso>&page=1&limit=10
router.get('/', listCursosController);

// GET /api/cursos/:id
router.get('/:id', getCursoController);

module.exports = router;