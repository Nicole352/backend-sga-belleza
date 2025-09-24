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
router.post('/', upload.fields([
  { name: 'comprobante', maxCount: 1 },
  { name: 'documento_identificacion', maxCount: 1 },
  { name: 'documento_estatus_legal', maxCount: 1 }
]), async (req, res) => {
  const {
    identificacion_solicitante,
    nombre_solicitante,
    apellido_solicitante,
    telefono_solicitante,
    email_solicitante,
    fecha_nacimiento_solicitante,
    direccion_solicitante,
    genero_solicitante,
    horario_preferido,
    id_tipo_curso,
    monto_matricula,
    metodo_pago,
    // Nuevos campos del comprobante
    numero_comprobante,
    banco_comprobante,
    fecha_transferencia
  } = req.body;

  // Validaciones mínimas
  if (!identificacion_solicitante || !nombre_solicitante || !apellido_solicitante || !email_solicitante) {
    return res.status(400).json({ error: 'Faltan campos obligatorios del solicitante' });
  }
  if (!id_tipo_curso || !monto_matricula || !metodo_pago) {
    return res.status(400).json({ error: 'Faltan datos del curso/pago' });
  }
  if (!horario_preferido) {
    return res.status(400).json({ error: 'El horario preferido es obligatorio' });
  }
  // Validaciones específicas para transferencia
  if (metodo_pago === 'transferencia') {
    if (!numero_comprobante || !numero_comprobante.trim()) {
      return res.status(400).json({ error: 'El número de comprobante es obligatorio para transferencia' });
    }
    if (!banco_comprobante) {
      return res.status(400).json({ error: 'El banco es obligatorio para transferencia' });
    }
    if (!fecha_transferencia) {
      return res.status(400).json({ error: 'La fecha de transferencia es obligatoria' });
    }
  }
  
  // Comprobante obligatorio para transferencia y efectivo
  const comprobanteFile = req.files?.comprobante?.[0];
  if ((metodo_pago === 'transferencia' || metodo_pago === 'efectivo') && !comprobanteFile) {
    return res.status(400).json({ error: 'El comprobante es obligatorio para transferencia o efectivo' });
  }
  // Documento de identificación obligatorio
  const documentoIdentificacionFile = req.files?.documento_identificacion?.[0];
  if (!documentoIdentificacionFile) {
    return res.status(400).json({ error: 'El documento de identificación es obligatorio' });
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

  // Validar número de comprobante único (GLOBAL - nunca se puede repetir)
  if (numero_comprobante && numero_comprobante.trim()) {
    try {
      const [existingRows] = await pool.execute(
        'SELECT id_solicitud FROM solicitudes_matricula WHERE numero_comprobante = ?', 
        [numero_comprobante.trim().toUpperCase()]
      );
      if (existingRows.length > 0) {
        return res.status(400).json({ 
          error: 'Este número de comprobante ya fue utilizado en otra solicitud. Cada comprobante debe ser único.' 
        });
      }
    } catch (e) {
      console.error('Error validando número de comprobante:', e);
      return res.status(500).json({ error: 'Error validando número de comprobante' });
    }
  }

  // Procesar archivos
  const comprobanteBuffer = comprobanteFile ? comprobanteFile.buffer : null;
  const comprobanteMime = comprobanteFile ? comprobanteFile.mimetype : null;
  const comprobanteSizeKb = comprobanteFile ? Math.ceil(comprobanteFile.size / 1024) : null;
  const comprobanteNombreOriginal = comprobanteFile ? comprobanteFile.originalname : null;

  const documentoIdentificacionBuffer = documentoIdentificacionFile ? documentoIdentificacionFile.buffer : null;
  const documentoIdentificacionMime = documentoIdentificacionFile ? documentoIdentificacionFile.mimetype : null;
  const documentoIdentificacionSizeKb = documentoIdentificacionFile ? Math.ceil(documentoIdentificacionFile.size / 1024) : null;
  const documentoIdentificacionNombreOriginal = documentoIdentificacionFile ? documentoIdentificacionFile.originalname : null;

  const documentoEstatusLegalFile = req.files?.documento_estatus_legal?.[0];
  const documentoEstatusLegalBuffer = documentoEstatusLegalFile ? documentoEstatusLegalFile.buffer : null;
  const documentoEstatusLegalMime = documentoEstatusLegalFile ? documentoEstatusLegalFile.mimetype : null;
  const documentoEstatusLegalSizeKb = documentoEstatusLegalFile ? Math.ceil(documentoEstatusLegalFile.size / 1024) : null;
  const documentoEstatusLegalNombreOriginal = documentoEstatusLegalFile ? documentoEstatusLegalFile.originalname : null;

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
      horario_preferido,
      id_tipo_curso,
      monto_matricula,
      metodo_pago,
      numero_comprobante,
      banco_comprobante,
      fecha_transferencia,
      comprobante_pago,
      comprobante_mime,
      comprobante_size_kb,
      comprobante_nombre_original,
      documento_identificacion,
      documento_identificacion_mime,
      documento_identificacion_size_kb,
      documento_identificacion_nombre_original,
      documento_estatus_legal,
      documento_estatus_legal_mime,
      documento_estatus_legal_size_kb,
      documento_estatus_legal_nombre_original
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

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
      horario_preferido,
      Number(id_tipo_curso),
      Number(monto_matricula),
      metodo_pago,
      numero_comprobante ? numero_comprobante.trim().toUpperCase() : null,
      banco_comprobante || null,
      fecha_transferencia || null,
      comprobanteBuffer,
      comprobanteMime,
      comprobanteSizeKb,
      comprobanteNombreOriginal,
      documentoIdentificacionBuffer,
      documentoIdentificacionMime,
      documentoIdentificacionSizeKb,
      documentoIdentificacionNombreOriginal,
      documentoEstatusLegalBuffer,
      documentoEstatusLegalMime,
      documentoEstatusLegalSizeKb,
      documentoEstatusLegalNombreOriginal
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
        s.telefono_solicitante,
        s.email_solicitante,
        s.fecha_nacimiento_solicitante,
        s.horario_preferido,
        s.id_tipo_curso,
        tc.nombre AS tipo_curso_nombre,
        s.estado,
        s.fecha_solicitud,
        s.metodo_pago,
        s.numero_comprobante,
        s.banco_comprobante,
        s.fecha_transferencia
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

// GET /api/solicitudes/:id/documento-identificacion (admin)
router.get('/:id/documento-identificacion', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const [rows] = await pool.execute(
      `
      SELECT documento_identificacion, documento_identificacion_mime, documento_identificacion_nombre_original
      FROM solicitudes_matricula
      WHERE id_solicitud = ?
      `,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
    const row = rows[0];
    if (!row.documento_identificacion) return res.status(404).json({ error: 'No hay documento de identificación para esta solicitud' });

    const mime = row.documento_identificacion_mime || 'application/octet-stream';
    const filename = row.documento_identificacion_nombre_original || `documento-identificacion-${id}`;
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(row.documento_identificacion);
  } catch (err) {
    console.error('Error obteniendo documento de identificación:', err);
    return res.status(500).json({ error: 'Error al obtener el documento de identificación' });
  }
});

// GET /api/solicitudes/:id/documento-estatus-legal (admin)
router.get('/:id/documento-estatus-legal', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const [rows] = await pool.execute(
      `
      SELECT documento_estatus_legal, documento_estatus_legal_mime, documento_estatus_legal_nombre_original
      FROM solicitudes_matricula
      WHERE id_solicitud = ?
      `,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Solicitud no encontrada' });
    const row = rows[0];
    if (!row.documento_estatus_legal) return res.status(404).json({ error: 'No hay documento de estatus legal para esta solicitud' });

    const mime = row.documento_estatus_legal_mime || 'application/octet-stream';
    const filename = row.documento_estatus_legal_nombre_original || `documento-estatus-legal-${id}`;
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(row.documento_estatus_legal);
  } catch (err) {
    console.error('Error obteniendo documento de estatus legal:', err);
    return res.status(500).json({ error: 'Error al obtener el documento de estatus legal' });
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
