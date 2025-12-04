const express = require('express');
const router = express.Router();
const historialController = require('../controllers/historial-usuario.controller');
const { verificarToken } = require('../middleware/auth');

// Obtener historial detallado de un estudiante
router.get('/estudiante/:id_usuario', verificarToken, historialController.getHistorialEstudiante);

// Obtener historial detallado de un docente
router.get('/docente/:id_usuario', verificarToken, historialController.getHistorialDocente);

module.exports = router;
