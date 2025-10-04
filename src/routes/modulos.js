const express = require('express');
const router = express.Router();
const modulosController = require('../controllers/modulos.controller');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/modulos/curso/:id_curso - Obtener módulos de un curso
router.get('/curso/:id_curso', modulosController.getModulosByCurso);

// GET /api/modulos/:id/stats - Obtener estadísticas del módulo
router.get('/:id/stats', modulosController.getModuloStats);

// GET /api/modulos/:id - Obtener módulo por ID
router.get('/:id', modulosController.getModuloById);

// POST /api/modulos - Crear nuevo módulo (solo docentes)
router.post('/', modulosController.createModulo);

// PUT /api/modulos/:id - Actualizar módulo (solo docente propietario)
router.put('/:id', modulosController.updateModulo);

// DELETE /api/modulos/:id - Eliminar módulo (solo docente propietario)
router.delete('/:id', modulosController.deleteModulo);

module.exports = router;
