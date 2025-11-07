const express = require('express');
const router = express.Router();
const adminPagosController = require('../controllers/admin-pagos.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Aplicar autenticación a todas las rutas
router.use(authMiddleware);
router.use(requireRole(['admin', 'administrativo']));

// Obtener todos los pagos (con filtros)
router.get('/', adminPagosController.getAllPagos);

// Obtener estadísticas de pagos
router.get('/estadisticas', adminPagosController.getEstadisticas);

// IMPORTANTE: Rutas específicas ANTES de rutas con parámetros dinámicos
// Descargar comprobante de pago (DEBE IR ANTES de /:id)
router.get('/:id/comprobante', adminPagosController.descargarComprobante);

// Obtener detalle de un pago específico
router.get('/:id', adminPagosController.getPagoDetalle);

// Verificar un pago (cambiar estado a verificado)
router.put('/:id/verificar', adminPagosController.verificarPago);

// Rechazar un pago (volver a pendiente con observaciones)
router.put('/:id/rechazar', adminPagosController.rechazarPago);

module.exports = router;
