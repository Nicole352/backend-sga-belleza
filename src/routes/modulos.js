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

// GET /api/modulos/:id/promedios-ponderados - Obtener promedios de todos los estudiantes
router.get('/:id/promedios-ponderados', modulosController.getPromediosPonderados);

// GET /api/modulos/:id/promedio-ponderado/:id_estudiante - Obtener promedio de un estudiante
router.get('/:id/promedio-ponderado/:id_estudiante', modulosController.getPromedioPonderado);

// GET /api/modulos/:id - Obtener módulo por ID
router.get('/:id', modulosController.getModuloById);

// POST /api/modulos - Crear nuevo módulo (solo docentes)
router.post('/', modulosController.createModulo);

// PUT /api/modulos/:id - Actualizar módulo (solo docente propietario)
router.put('/:id', modulosController.updateModulo);

// PUT /api/modulos/:id/cerrar - Cerrar módulo (solo docente propietario)
router.put('/:id/cerrar', modulosController.cerrarModulo);

// PUT /api/modulos/:id/reabrir - Reabrir módulo (solo docente propietario)
router.put('/:id/reabrir', modulosController.reabrirModulo);

// PUT /api/modulos/:id/publicar-promedios - Publicar promedios del módulo
router.put('/:id/publicar-promedios', modulosController.publicarPromedios);

// PUT /api/modulos/:id/ocultar-promedios - Ocultar promedios del módulo
router.put('/:id/ocultar-promedios', modulosController.ocultarPromedios);

// DELETE /api/modulos/:id - Eliminar módulo (solo docente propietario)
router.delete('/:id', modulosController.deleteModulo);

module.exports = router;
