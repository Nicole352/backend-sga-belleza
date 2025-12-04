const express = require('express');
const aulasController = require('../controllers/aulas.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(authMiddleware);

// GET /api/aulas - Obtener aulas con paginación y filtros (todos los usuarios autenticados)
router.get('/', aulasController.getAulas);

// GET /api/aulas/:id - Obtener aula específica (todos los usuarios autenticados)
router.get('/:id', aulasController.getAulaById);

// Rutas de modificación: solo administrativos y superadmin
router.use(requireRole(['administrativo', 'superadmin']));

// POST /api/aulas - Crear nueva aula
router.post('/', aulasController.createAula);

// PUT /api/aulas/:id - Actualizar aula
router.put('/:id', aulasController.updateAula);

// DELETE /api/aulas/:id - Eliminar aula
router.delete('/:id', aulasController.deleteAula);

module.exports = router;
