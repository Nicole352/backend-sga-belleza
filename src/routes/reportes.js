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

module.exports = router;
