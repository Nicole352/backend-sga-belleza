const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const {
    getSystemMetrics,
    getDatabaseMetrics,
    getSystemLogs,
    getSystemHealth
} = require('../controllers/metricas-sistema.controller');

// Todas las rutas requieren autenticación y rol de superadmin
router.use(authMiddleware);
router.use(requireRole(['superadmin']));

// GET /api/system/metrics - Métricas del sistema (CPU, RAM, etc.)
router.get('/metrics', getSystemMetrics);

// GET /api/system/database-metrics - Métricas de la base de datos
router.get('/database-metrics', getDatabaseMetrics);

// GET /api/system/logs - Logs del sistema
router.get('/logs', getSystemLogs);

// GET /api/system/health - Health check
router.get('/health', getSystemHealth);

module.exports = router;
