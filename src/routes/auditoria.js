const express = require('express');
const router = express.Router();
const auditoriaController = require('../controllers/auditoria.controller');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

/**
 * @route   GET /api/auditoria
 * @desc    Obtener lista paginada de auditorías con filtros
 * @access  Private (Admin)
 * @query   pagina, limite, usuario_id, tabla, operacion, fecha_inicio, fecha_fin, id_registro, busqueda
 */
router.get('/', auditoriaController.listarAuditorias);

/**
 * @route   GET /api/auditoria/stats
 * @desc    Obtener estadísticas de auditoría
 * @access  Private (Admin)
 */
router.get('/stats', auditoriaController.obtenerEstadisticas);

/**
 * @route   GET /api/auditoria/tablas
 * @desc    Obtener lista de tablas únicas registradas
 * @access  Private (Admin)
 */
router.get('/tablas', auditoriaController.obtenerTablasUnicas);

/**
 * @route   GET /api/auditoria/usuario/:userId
 * @desc    Obtener auditorías de un usuario específico
 * @access  Private (Admin)
 */
router.get('/usuario/:userId', auditoriaController.obtenerAuditoriasPorUsuario);

/**
 * @route   GET /api/auditoria/tabla/:tabla
 * @desc    Obtener auditorías de una tabla específica
 * @access  Private (Admin)
 */
router.get('/tabla/:tabla', auditoriaController.obtenerAuditoriasPorTabla);

/**
 * @route   GET /api/auditoria/:id
 * @desc    Obtener detalle de auditoría específica
 * @access  Private (Admin)
 */
router.get('/:id', auditoriaController.obtenerDetalleAuditoria);

module.exports = router;
