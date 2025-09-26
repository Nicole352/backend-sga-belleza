const express = require('express');
const aulasController = require('../controllers/aulas.controller');
const router = express.Router();

// GET /api/aulas - Obtener aulas con paginación y filtros
router.get('/', aulasController.getAulas);

// GET /api/aulas/:id - Obtener aula específica
router.get('/:id', aulasController.getAulaById);

// POST /api/aulas - Crear nueva aula
router.post('/', aulasController.createAula);

// PUT /api/aulas/:id - Actualizar aula
router.put('/:id', aulasController.updateAula);

// DELETE /api/aulas/:id - Eliminar aula
router.delete('/:id', aulasController.deleteAula);

module.exports = router;
