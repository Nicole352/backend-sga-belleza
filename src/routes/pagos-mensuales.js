const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const pagosMenualesController = require('../controllers/pagos-mensuales.controller');

// Configurar multer para manejar archivos
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB máximo
  },
  fileFilter: (req, file, cb) => {
    // Permitir solo imágenes y PDFs
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo JPG, PNG, WEBP y PDF.'), false);
    }
  }
});

// GET /api/pagos-mensuales/reporte/excel - Generar reporte Excel (sin autenticación para admin)
router.get('/reporte/excel', pagosMenualesController.generarReporteExcel);

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// GET /api/pagos-mensuales/resumen - Obtener resumen de pagos del estudiante
router.get('/resumen', pagosMenualesController.getResumenPagos);

// GET /api/pagos-mensuales/cursos-pendientes - Obtener cursos con pagos pendientes
router.get('/cursos-pendientes', pagosMenualesController.getCursosConPagosPendientes);

// GET /api/pagos-mensuales/cuotas/:id_matricula - Obtener cuotas de una matrícula
router.get('/cuotas/:id_matricula', pagosMenualesController.getCuotasByMatricula);

// GET /api/pagos-mensuales/pago/:id_pago - Obtener información de un pago específico
router.get('/pago/:id_pago', pagosMenualesController.getPagoById);

// POST /api/pagos-mensuales/pagar/:id_pago - Procesar pago de mensualidad
router.post('/pagar/:id_pago', upload.single('comprobante'), pagosMenualesController.pagarCuota);

// GET /api/pagos-mensuales/comprobante/:id_pago - Descargar comprobante de pago
router.get('/comprobante/:id_pago', pagosMenualesController.getComprobante);

module.exports = router;