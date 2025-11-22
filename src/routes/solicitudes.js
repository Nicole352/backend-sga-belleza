const express = require('express');
const multer = require('multer');
const solicitudesController = require('../controllers/solicitudes.controller');
const { strictLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Configuración de Multer (memoria) para subir archivos y guardarlos en Cloudinary
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    // Aceptar PDF, JPG, PNG, WEBP
    const allowed = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Tipo de archivo no permitido (solo PDF/JPG/PNG/WEBP)'));
    }
    cb(null, true);
  }
});

// POST /api/solicitudes
// 🔒 PROTEGIDO: Rate limiting para prevenir spam (30 req/min por IP)
router.post('/',
  strictLimiter,
  upload.fields([
    { name: 'comprobante', maxCount: 1 },
    { name: 'documento_identificacion', maxCount: 1 },
    { name: 'documento_estatus_legal', maxCount: 1 },
    { name: 'certificado_cosmetologia', maxCount: 1 } // Certificado de Cosmetología (solo para Cosmetría)
  ]),
  solicitudesController.createSolicitud
);

// GET /api/solicitudes (admin)
router.get('/', solicitudesController.getSolicitudes);

// GET /api/solicitudes/:id (admin)
router.get('/:id', solicitudesController.getSolicitudById);

// NOTA: Los archivos ahora se sirven directamente desde Cloudinary
// Las URLs están en los campos: comprobante_pago_url, documento_identificacion_url, etc.

// PATCH /api/solicitudes/:id/decision (admin)
router.patch('/:id/decision', solicitudesController.updateDecision);

// PATCH /api/solicitudes/:id/promocion - Actualizar promoción seleccionada
router.patch('/:id/promocion', solicitudesController.updatePromocionSeleccionada);

// GET /api/solicitudes/reporte/excel (admin) - Generar reporte Excel
router.get('/reporte/excel', solicitudesController.generarReporteExcel);

module.exports = router;
