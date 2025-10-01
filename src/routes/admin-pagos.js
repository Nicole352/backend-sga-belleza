const express = require('express');
const router = express.Router();
const adminPagosController = require('../controllers/admin-pagos.controller');

// Obtener todos los pagos (con filtros)
router.get('/', adminPagosController.getAllPagos);

// Obtener estadísticas de pagos
router.get('/estadisticas', adminPagosController.getEstadisticas);

// Obtener detalle de un pago específico
router.get('/:id', adminPagosController.getPagoDetalle);

// Verificar un pago (cambiar estado a verificado)
router.put('/:id/verificar', adminPagosController.verificarPago);

// Rechazar un pago (volver a pendiente con observaciones)
router.put('/:id/rechazar', adminPagosController.rechazarPago);

// Descargar comprobante de pago
router.get('/:id/comprobante', adminPagosController.descargarComprobante);

module.exports = router;
