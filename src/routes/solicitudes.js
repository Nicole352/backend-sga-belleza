const express = require('express');
const multer = require('multer');
const solicitudesController = require('../controllers/solicitudes.controller');

const router = express.Router();

// Configuración de Multer (memoria) para subir comprobantes y guardarlos en BD (columna comprobante_pago LONGBLOB)
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
router.post('/', upload.fields([
  { name: 'comprobante', maxCount: 1 },
  { name: 'documento_identificacion', maxCount: 1 },
  { name: 'documento_estatus_legal', maxCount: 1 }
]), solicitudesController.createSolicitud);

// GET /api/solicitudes (admin)
router.get('/', solicitudesController.getSolicitudes);

// GET /api/solicitudes/:id (admin)
router.get('/:id', solicitudesController.getSolicitudById);

// GET /api/solicitudes/:id/comprobante (admin)
router.get('/:id/comprobante', solicitudesController.getComprobante);

// GET /api/solicitudes/:id/documento-identificacion (admin)
router.get('/:id/documento-identificacion', solicitudesController.getDocumentoIdentificacion);

// GET /api/solicitudes/:id/documento-estatus-legal (admin)
router.get('/:id/documento-estatus-legal', solicitudesController.getDocumentoEstatusLegal);

// PATCH /api/solicitudes/:id/decision (admin)
router.patch('/:id/decision', solicitudesController.updateDecision);

// PATCH /api/solicitudes/:id/promocion - Actualizar promoción seleccionada
router.patch('/:id/promocion', solicitudesController.updatePromocionSeleccionada);

// GET /api/solicitudes/reporte/excel (admin) - Generar reporte Excel
router.get('/reporte/excel', solicitudesController.generarReporteExcel);

module.exports = router;
