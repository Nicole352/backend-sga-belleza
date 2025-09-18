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
    identificacion_solicitante,
    nombre_solicitante,
    apellido_solicitante,
    telefono_solicitante,
    email_solicitante,
    fecha_nacimiento_solicitante,
    direccion_solicitante,
    genero_solicitante,
    id_tipo_curso,
    monto_matricula,
    metodo_pago
  } = req.body;

  // Validaciones mínimas
  if (!identificacion_solicitante || !nombre_solicitante || !apellido_solicitante || !email_solicitante) {
    return res.status(400).json({ error: 'Faltan campos obligatorios del solicitante' });
  }
  if (!id_tipo_curso || !monto_matricula || !metodo_pago) {
    return res.status(400).json({ error: 'Faltan datos del curso/pago' });
  }
  // Comprobante obligatorio para transferencia y efectivo
  if ((metodo_pago === 'transferencia' || metodo_pago === 'efectivo') && !req.file) {
    return res.status(400).json({ error: 'El comprobante es obligatorio para transferencia o efectivo' });
  }

  // Validar tipo de curso existente y estado disponible
  try {
    const idTipoCursoNum = Number(id_tipo_curso);
    if (!idTipoCursoNum) return res.status(400).json({ error: 'id_tipo_curso inválido' });
    const [tipoCursoRows] = await pool.execute('SELECT id_tipo_curso, estado FROM tipos_cursos WHERE id_tipo_curso = ?', [idTipoCursoNum]);
    if (!tipoCursoRows.length) return res.status(400).json({ error: 'El tipo de curso no existe' });
    const tipoCurso = tipoCursoRows[0];
    if (tipoCurso.estado !== 'activo') {
      return res.status(400).json({ error: 'El tipo de curso no está disponible para matrícula' });
    }
  } catch (e) {
    console.error('Error validando tipo de curso:', e);
    return res.status(500).json({ error: 'Error validando tipo de curso' });
  }

  const comprobanteBuffer = req.file ? req.file.buffer : null;
  const comprobanteMime = req.file ? req.file.mimetype : null;
  const comprobanteSizeKb = req.file ? Math.ceil(req.file.size / 1024) : null;
  const comprobanteNombreOriginal = req.file ? req.file.originalname : null;
  const codigo = generarCodigoSolicitud();

  try {
    const sql = `INSERT INTO solicitudes_matricula (
      codigo_solicitud,
      identificacion_solicitante,
      nombre_solicitante,
      apellido_solicitante,
      telefono_solicitante,
      email_solicitante,
      fecha_nacimiento_solicitante,
      direccion_solicitante,
      genero_solicitante,
      id_tipo_curso,
      monto_matricula,
      metodo_pago,
      comprobante_pago,
      comprobante_mime,
      comprobante_size_kb,
      comprobante_nombre_original
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      codigo,
      identificacion_solicitante,
      nombre_solicitante,
      apellido_solicitante,
      telefono_solicitante || null,
      email_solicitante,
      fecha_nacimiento_solicitante || null,
      direccion_solicitante || null,
      genero_solicitante || null,
      Number(id_tipo_curso),
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
    // Aggregated counters per estado
    if (req.query.aggregate === 'by_estado') {
      try {
        const tipo = req.query.tipo ? Number(req.query.tipo) : undefined;
        let sqlAgg = `SELECT s.estado, COUNT(*) AS total FROM solicitudes_matricula s WHERE 1=1`;
        const paramsAgg = [];
        if (tipo) { sqlAgg += ' AND s.id_tipo_curso = ?'; paramsAgg.push(tipo); }
        sqlAgg += ' GROUP BY s.estado';
        const [rowsAgg] = await pool.execute(sqlAgg, paramsAgg);
        // Normalize to include all estados keys
        const result = {
          pendiente: 0,
          aprobado: 0,
          rechazado: 0,
          observaciones: 0,
        };
        for (const r of rowsAgg) {
          if (r.estado in result) {
            result[r.estado] = Number(r.total) || 0;
          }
        }
        return res.json(result);
      } catch (e) {
        console.error('Error agregando conteos por estado:', e);
        return res.status(500).json({ error: 'Error obteniendo conteos' });
      }
    }

    // Solo filtrar por estado si el cliente lo envía explícitamente
    const estado = typeof req.query.estado === 'string' && req.query.estado.length > 0
      ? req.query.estado
      : undefined;
    const curso = req.query.curso ? Number(req.query.curso) : undefined;
    const tipo = req.query.tipo ? Number(req.query.tipo) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    let sql = `
      SELECT
        s.id_solicitud,
        s.codigo_solicitud,
        s.identificacion_solicitante,
        s.nombre_solicitante,
        s.apellido_solicitante,
        s.email_solicitante,
        s.id_tipo_curso,
        tc.nombre AS tipo_curso_nombre,
        s.estado,
        s.fecha_solicitud
      FROM solicitudes_matricula s
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = s.id_tipo_curso
      WHERE 1=1
    `;
    const params = [];

    if (estado) { sql += ' AND s.estado = ?'; params.push(estado); }
    if (tipo)   { sql += ' AND s.id_tipo_curso = ?'; params.push(tipo); }

    // Evitar placeholders en LIMIT/OFFSET para compatibilidad
    sql += ` ORDER BY s.fecha_solicitud DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

    // Total count with same filters
    let sqlCount = `SELECT COUNT(*) AS total FROM solicitudes_matricula s WHERE 1=1`;
    const paramsCount = [];
    if (estado) { sqlCount += ' AND s.estado = ?'; paramsCount.push(estado); }
    if (tipo)   { sqlCount += ' AND s.id_tipo_curso = ?'; paramsCount.push(tipo); }

    const [[countRow]] = await pool.execute(sqlCount, paramsCount);
    const totalCount = Number(countRow?.total || 0);

    const [rows] = await pool.execute(sql, params);
    res.setHeader('X-Total-Count', String(totalCount));
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
      SELECT 
        s.*, 
        tc.nombre AS tipo_curso_nombre
      FROM solicitudes_matricula s
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = s.id_tipo_curso
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

// GET /api/solicitudes/:id/comprobante (admin)
router.get('/:id/comprobante', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const [rows] = await pool.execute(
      `
      SELECT comprobante_pago, comprobante_mime, comprobante_nombre_original
      FROM solicitudes_matricula
      WHERE id_solicitud = ?
      `,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
    const row = rows[0];
    if (!row.comprobante_pago) return res.status(404).json({ error: 'No hay comprobante para esta solicitud' });

    const mime = row.comprobante_mime || 'application/octet-stream';
    const filename = row.comprobante_nombre_original || `comprobante-${id}`;
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(row.comprobante_pago);
  } catch (err) {
    console.error('Error obteniendo comprobante:', err);
    return res.status(500).json({ error: 'Error al obtener el comprobante' });
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
