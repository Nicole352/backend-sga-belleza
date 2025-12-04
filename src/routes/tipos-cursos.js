const express = require('express');
const {
  listTiposCursos,
  createTipoCurso,
  updateTipoCurso,
  deleteTipoCurso,
} = require('../controllers/tipos-cursos.controller');

const router = express.Router();

// GET /api/tipos-cursos?estado=activo&limit=200
router.get('/', listTiposCursos);

// POST /api/tipos-cursos
router.post('/', createTipoCurso);

// PUT /api/tipos-cursos/:id
router.put('/:id', updateTipoCurso);

// DELETE /api/tipos-cursos/:id
router.delete('/:id', deleteTipoCurso);

module.exports = router;
