const express = require('express');
const router = express.Router();
const calificacionesController = require('../controllers/calificaciones.controller');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/calificaciones/estudiante/curso/:id_curso - Obtener calificaciones de un estudiante en un curso
router.get('/estudiante/curso/:id_curso', calificacionesController.getCalificacionesByEstudianteCurso);

// GET /api/calificaciones/promedio/modulo/:id_modulo - Obtener promedio de un módulo
router.get('/promedio/modulo/:id_modulo', calificacionesController.getPromedioModulo);

// GET /api/calificaciones/promedio/curso/:id_curso - Obtener promedio general del curso
router.get('/promedio/curso/:id_curso', calificacionesController.getPromedioCurso);

// GET /api/calificaciones/entrega/:id_entrega - Obtener calificación de una entrega
router.get('/entrega/:id_entrega', calificacionesController.getCalificacionByEntrega);

module.exports = router;
