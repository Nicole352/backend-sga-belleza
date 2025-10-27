const express = require('express');
const router = express.Router();
const entregasController = require('../controllers/entregas.controller');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/entregas/estudiante/tarea/:id_tarea - Obtener entrega del estudiante en una tarea
router.get('/estudiante/tarea/:id_tarea', entregasController.getEntregaByTareaEstudiante);

// GET /api/entregas/tarea/:id_tarea - Obtener entregas de una tarea (docente)
router.get('/tarea/:id_tarea', entregasController.getEntregasByTarea);

// GET /api/entregas/:id/archivo - Descargar archivo de entrega
router.get('/:id/archivo', entregasController.getArchivoEntrega);

// GET /api/entregas/:id - Obtener entrega por ID
router.get('/:id', entregasController.getEntregaById);

// POST /api/entregas - Crear nueva entrega (estudiante)
router.post('/', entregasController.createEntrega);

// PUT /api/entregas/:id - Actualizar entrega (estudiante propietario)
router.put('/:id', entregasController.updateEntrega);

// DELETE /api/entregas/:id - Eliminar entrega (estudiante propietario)
router.delete('/:id', entregasController.deleteEntrega);

// POST /api/entregas/:id/calificar - Calificar entrega (docente)
router.post('/:id/calificar', entregasController.calificarEntrega);

module.exports = router;
