const express = require('express');
const docentesController = require('../controllers/docentes.controller');
const router = express.Router();

// GET /api/docentes - Obtener docentes con paginación y filtros
router.get('/', docentesController.getDocentes);

// GET /api/docentes/:id - Obtener docente específico
router.get('/:id', docentesController.getDocenteById);

// POST /api/docentes - Crear nuevo docente
router.post('/', docentesController.createDocente);

// PUT /api/docentes/:id - Actualizar docente
router.put('/:id', docentesController.updateDocente);

// DELETE /api/docentes/:id - Eliminar docente (cambiar estado a inactivo)
router.delete('/:id', docentesController.deleteDocente);

// GET /api/docentes/stats/general - Estadísticas de docentes
router.get('/stats/general', docentesController.getDocentesStats);

module.exports = router;
