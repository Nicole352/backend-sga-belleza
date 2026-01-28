const express = require('express');
const multer = require('multer');
const { pool } = require('../config/database');
const {
  getCursosDocenteController,
  getEstudiantesCursoController,
  getAsistenciaByFechaController,
  guardarAsistenciaController,
  getHistorialEstudianteController,
  getReporteCursoController,
  generarExcelFechaController,
  generarExcelRangoController
} = require('../controllers/asistencias.controller');

const { authMiddleware } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Configuración de Multer para asistencias
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB máximo
  }
});

// Obtener cursos que imparte un docente
router.get('/cursos-docente/:id_docente', authMiddleware, generalLimiter, getCursosDocenteController);

// Obtener estudiantes de un curso
router.get('/estudiantes/:id_curso', authMiddleware, generalLimiter, getEstudiantesCursoController);

// Obtener asistencia de un curso en una fecha específica
router.get('/curso/:id_curso/fecha/:fecha', authMiddleware, generalLimiter, getAsistenciaByFechaController);

// Obtener asistencias de un curso por rango de fechas
router.get('/curso/:id_curso/rango', authMiddleware, generalLimiter, getAsistenciaByFechaController);

// Guardar o actualizar asistencia (múltiples registros)
router.post('/', authMiddleware, generalLimiter, upload.any(), guardarAsistenciaController);

// Obtener historial de asistencia de un estudiante en un curso
router.get('/estudiante/:id_estudiante/curso/:id_curso', authMiddleware, generalLimiter, getHistorialEstudianteController);

// Obtener reporte completo de asistencia de un curso
router.get('/reporte/:id_curso', authMiddleware, generalLimiter, getReporteCursoController);

// Descargar Excel de asistencia para una fecha específica
router.get('/excel/fecha/:id_curso/:fecha', authMiddleware, generalLimiter, generarExcelFechaController);

// Descargar Excel de asistencia para un rango de fechas
router.get('/excel/rango/:id_curso', authMiddleware, generalLimiter, generarExcelRangoController);

// Obtener URL del documento adjunto de asistencia
router.get('/documento/:id_asistencia', authMiddleware, generalLimiter, async (req, res) => {
  try {
    const { id_asistencia } = req.params;

    if (!id_asistencia) {
      return res.status(400).json({ error: 'ID de asistencia requerido' });
    }

    // Obtener la URL del documento desde la base de datos
    const [asistencias] = await pool.execute(
      'SELECT documento_justificacion_url, documento_justificacion_public_id FROM asistencias WHERE id_asistencia = ?',
      [id_asistencia]
    );

    if (asistencias.length === 0) {
      return res.status(404).json({ error: 'Asistencia no encontrada' });
    }

    const asistencia = asistencias[0];

    if (!asistencia.documento_justificacion_url) {
      return res.status(404).json({ error: 'No hay documento adjunto' });
    }

    // Retornar JSON con la URL de Cloudinary
    return res.json({
      success: true,
      documento_justificacion_url: asistencia.documento_justificacion_url,
      documento_justificacion_public_id: asistencia.documento_justificacion_public_id
    });
  } catch (err) {
    console.error('Error obteniendo documento:', err);
    return res.status(500).json({ error: 'Error al obtener documento' });
  }
});

module.exports = router;
