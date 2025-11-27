const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes.controller');
const { authMiddleware } = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// ========================================
// REPORTE DE ESTUDIANTES
// ========================================

// Vista previa (datos JSON)
router.get('/estudiantes', reportesController.getReporteEstudiantes);

// Descargar PDF
router.get('/estudiantes/pdf', reportesController.descargarPDFEstudiantes);

// Descargar Excel
router.get('/estudiantes/excel', reportesController.descargarExcelEstudiantes);

// ========================================
// REPORTE FINANCIERO
// ========================================

// Vista previa (datos JSON)
router.get('/financiero', reportesController.getReporteFinanciero);

// Descargar PDF
router.get('/financiero/pdf', reportesController.descargarPDFFinanciero);

// Descargar Excel
router.get('/financiero/excel', reportesController.descargarExcelFinanciero);

// ========================================
// REPORTE DE CURSOS
// ========================================

// Vista previa (datos JSON)
router.get('/cursos', reportesController.getReporteCursos);

// Descargar PDF
router.get('/cursos/pdf', reportesController.descargarPDFCursos);

// Descargar Excel
router.get('/cursos/excel', reportesController.descargarExcelCursos);

// ========================================
// UTILIDADES
// ========================================

// Obtener lista de cursos para filtros
router.get('/cursos-filtro', reportesController.getCursosParaFiltro);

// Obtener rango de fechas dinámico basado en datos reales
router.get('/rango-fechas', reportesController.getRangoFechasDinamico);

// ========================================
// SISTEMA DE REPORTES CON TABLAS
// ========================================

// Obtener tipos de reportes disponibles
router.get('/tipos', reportesController.getTiposReportes);

// Obtener historial de reportes generados
router.get('/historial', reportesController.getHistorialReportes);

// Obtener estadísticas de reportes
router.get('/estadisticas', reportesController.getEstadisticasReportes);

// Descargar reportes con historial (versión 2)
router.get('/estudiantes/excel-v2', reportesController.descargarExcelEstudiantesV2);
router.get('/financiero/excel-v2', reportesController.descargarExcelFinancieroV2);
router.get('/cursos/excel-v2', reportesController.descargarExcelCursosV2);

module.exports = router;
