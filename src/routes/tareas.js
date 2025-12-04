const express = require('express');
const router = express.Router();
const tareasController = require('../controllers/tareas.controller');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/tareas/estudiante/curso/:id_curso - Obtener tareas de un estudiante en un curso
router.get('/estudiante/curso/:id_curso', tareasController.getTareasByEstudiante);

// GET /api/tareas/modulo/:id_modulo - Obtener tareas de un módulo
router.get('/modulo/:id_modulo', tareasController.getTareasByModulo);

// GET /api/tareas/:id/stats - Obtener estadísticas de la tarea
router.get('/:id/stats', tareasController.getTareaStats);

// GET /api/tareas/:id - Obtener tarea por ID
router.get('/:id', tareasController.getTareaById);

// POST /api/tareas - Crear nueva tarea (solo docentes)
router.post('/', tareasController.createTarea);

// PUT /api/tareas/:id - Actualizar tarea (solo docente propietario)
router.put('/:id', tareasController.updateTarea);

// DELETE /api/tareas/:id - Eliminar tarea (solo docente propietario)
router.delete('/:id', tareasController.deleteTarea);

module.exports = router;
