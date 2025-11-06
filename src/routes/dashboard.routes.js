const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);
router.use(requireRole(['admin', 'administrativo']));

router.get('/matriculas-por-mes', dashboardController.getMatriculasPorMes);
router.get('/actividad-reciente', dashboardController.getActividadReciente);
router.get('/estadisticas-pagos', dashboardController.getEstadisticasPagos);
router.get('/estadisticas-solicitudes', dashboardController.getEstadisticasSolicitudes);

module.exports = router;