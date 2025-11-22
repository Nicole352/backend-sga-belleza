const express = require('express');
const router = express.Router();
const notificacionesController = require('../controllers/notificaciones.controller');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Obtener notificaciones del usuario
router.get('/mis-notificaciones', notificacionesController.obtenerMisNotificaciones);

// Contar notificaciones no leídas
router.get('/no-leidas/count', notificacionesController.contarNoLeidas);

// Marcar una notificación como leída
router.put('/:id_notificacion/leida', notificacionesController.marcarComoLeida);

// Marcar todas las notificaciones como leídas
router.put('/marcar-todas-leidas', notificacionesController.marcarTodasComoLeidas);

module.exports = router;
