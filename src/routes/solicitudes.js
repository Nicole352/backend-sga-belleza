const express = require('express');
const multer = require('multer');
const { pool } = require('../config/database');

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

// Util: generar código de solicitud
function generarCodigoSolicitud() {
  const yyyy = new Date().getFullYear();
  const mm = String(new Date().getMonth() + 1).padStart(2, '0');
  const dd = String(new Date().getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `SOL-${yyyy}${mm}${dd}-${rand}`;
}

// POST /api/solicitudes
router.post('/', upload.single('comprobante'), async (req, res) => {
  const {
    cedula_solicitante,
    nombre_solicitante,
    apellido_solicitante,
    telefono_solicitante,
    email_solicitante,
    fecha_nacimiento_solicitante,
    direccion_solicitante,
    genero_solicitante,
    id_curso,
    monto_matricula,
    metodo_pago
  } = req.body;

  // Validaciones mínimas
  if (!cedula_solicitante || !nombre_solicitante || !apellido_solicitante || !email_solicitante) {
    return res.status(400).json({ error: 'Faltan campos obligatorios del solicitante' });
  }
  if (!id_curso || !monto_matricula || !metodo_pago) {
    return res.status(400).json({ error: 'Faltan datos del curso/pago' });
  }
  if (metodo_pago === 'transferencia' && !req.file) {
    return res.status(400).json({ error: 'El comprobante es obligatorio para transferencia' });
  }

  // Validar curso existente y estado disponible
  try {
    const idCursoNum = Number(id_curso);
    if (!idCursoNum) return res.status(400).json({ error: 'id_curso inválido' });
    const [cursoRows] = await pool.execute('SELECT id_curso, estado FROM cursos WHERE id_curso = ?', [idCursoNum]);
    if (!cursoRows.length) return res.status(400).json({ error: 'El curso no existe' });
    const curso = cursoRows[0];
    if (!['planificado', 'activo'].includes(curso.estado)) {
      return res.status(400).json({ error: 'El curso no está disponible para matrícula' });
    }
  } catch (e) {
    console.error('Error validando curso:', e);
    return res.status(500).json({ error: 'Error validando curso' });
  }

  const comprobanteBuffer = req.file ? req.file.buffer : null;
  const comprobanteMime = req.file ? req.file.mimetype : null;
  const comprobanteSizeKb = req.file ? Math.ceil(req.file.size / 1024) : null;
  const comprobanteNombreOriginal = req.file ? req.file.originalname : null;
  const codigo = generarCodigoSolicitud();

  try {
    const sql = `INSERT INTO solicitudes_matricula (
      codigo_solicitud,
      cedula_solicitante,
      nombre_solicitante,
      apellido_solicitante,
      telefono_solicitante,
      email_solicitante,
      fecha_nacimiento_solicitante,
      direccion_solicitante,
      genero_solicitante,
      id_curso,
      monto_matricula,
      metodo_pago,
      comprobante_pago,
      comprobante_mime,
      comprobante_size_kb,
      comprobante_nombre_original
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      codigo,
      cedula_solicitante,
      nombre_solicitante,
      apellido_solicitante,
      telefono_solicitante || null,
      email_solicitante,
      fecha_nacimiento_solicitante || null,
      direccion_solicitante || null,
      genero_solicitante || null,
      Number(id_curso),
      Number(monto_matricula),
      metodo_pago,
      comprobanteBuffer,
      comprobanteMime,
      comprobanteSizeKb,
      comprobanteNombreOriginal
    ];

    const [result] = await pool.execute(sql, values);

    return res.status(201).json({
      ok: true,
      id_solicitud: result.insertId,
      codigo_solicitud: codigo
    });
  } catch (error) {
    console.error('Error al crear solicitud:', error);
    // Errores de FK u otros
    return res.status(500).json({ error: 'Error al registrar la solicitud' });
  }
});

// GET /api/solicitudes (admin)
router.get('/', async (req, res) => {
  try {
    const estado = req.query.estado || 'pendiente';
    const curso = req.query.curso ? Number(req.query.curso) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    let sql = `
      SELECT
        s.id_solicitud,
        s.codigo_solicitud,
        s.nombre_solicitante,
        s.apellido_solicitante,
        s.email_solicitante,
        s.id_curso,
        s.estado,
        s.fecha_solicitud
      FROM solicitudes_matricula s
      WHERE 1=1
    `;
    const params = [];

    if (estado) { sql += ' AND s.estado = ?'; params.push(estado); }
    if (curso)  { sql += ' AND s.id_curso = ?'; params.push(curso); }

    sql += ' ORDER BY s.fecha_solicitud DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.execute(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error('Error listando solicitudes:', err);
    return res.status(500).json({ error: 'Error al listar solicitudes' });
  }
});

// GET /api/solicitudes/:id (admin)
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const [rows] = await pool.execute(
      `
      SELECT s.*
      FROM solicitudes_matricula s
      WHERE s.id_solicitud = ?
      `,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('Error obteniendo solicitud:', err);
    return res.status(500).json({ error: 'Error al obtener la solicitud' });
  }
});

// PATCH /api/solicitudes/:id/decision (admin)
router.patch('/:id/decision', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const { estado, observaciones, verificado_por } = req.body;
    const estadosPermitidos = ['aprobado', 'rechazado', 'observaciones'];
    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const sql = `
      UPDATE solicitudes_matricula
      SET estado = ?,
          observaciones = ?,
          verificado_por = ?,
          fecha_verificacion = NOW()
      WHERE id_solicitud = ?
    `;
    const params = [estado, observaciones || null, verificado_por || null, id];

    const [result] = await pool.execute(sql, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando decisión:', err);
    return res.status(500).json({ error: 'Error al actualizar la solicitud' });
  }
});

module.exports = router;
