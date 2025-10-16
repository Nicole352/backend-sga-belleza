const express = require('express');
const router = express.Router();
const usuariosActividadController = require('../controllers/usuarios-actividad.controller');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/usuarios-actividad/:id_usuario/pagos - Obtener pagos del estudiante
router.get('/:id_usuario/pagos', usuariosActividadController.getPagosEstudiante);

// GET /api/usuarios-actividad/:id_usuario/deberes - Obtener deberes del estudiante
router.get('/:id_usuario/deberes', usuariosActividadController.getDeberesEstudiante);

// GET /api/usuarios-actividad/:id_usuario/actividad - Obtener actividad combinada
router.get('/:id_usuario/actividad', usuariosActividadController.getActividadEstudiante);

module.exports = router;
