const { pool } = require('../config/database');
const SolicitudesModel = require('../models/solicitudes.model');
const { enviarNotificacionNuevaMatricula } = require('../services/emailService');

// Util: generar código de solicitud
function generarCodigoSolicitud() {
  const yyyy = new Date().getFullYear();
  const mm = String(new Date().getMonth() + 1).padStart(2, '0');
  const dd = String(new Date().getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `SOL-${yyyy}${mm}${dd}-${rand}`;
}

exports.createSolicitud = async (req, res) => {
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
    fecha_transferencia,
    // Campo para pago en efectivo
    recibido_por,
    // Campo para estudiantes existentes
    id_estudiante_existente
  } = req.body;

  // Función para convertir fecha a formato MySQL (YYYY-MM-DD)
  const convertirFecha = (fecha) => {
    if (!fecha) return null;
    
    // Si ya está en formato YYYY-MM-DD, retornar
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return fecha;
    }
    
    // Si está en formato DD/MM/YYYY, convertir
    const match = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const [_, dd, mm, yyyy] = match;
      return `${yyyy}-${mm}-${dd}`;
    }
    
    return null;
  };

  // Validaciones mínimas (más flexibles si es estudiante existente)
  if (!identificacion_solicitante) {
    return res.status(400).json({ error: 'La identificación es obligatoria' });
  }
  
  // Si NO es estudiante existente, validar campos completos
  if (!id_estudiante_existente) {
    if (!nombre_solicitante || !apellido_solicitante || !email_solicitante) {
      return res.status(400).json({ error: 'Faltan campos obligatorios del solicitante' });
    }
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

  // Validaciones específicas para efectivo
  if (metodo_pago === 'efectivo') {
    if (!numero_comprobante || !numero_comprobante.trim()) {
      return res.status(400).json({ error: 'El número de comprobante/factura es obligatorio para efectivo' });
    }
    if (!recibido_por || !recibido_por.trim()) {
      return res.status(400).json({ error: 'El nombre de quien recibió el pago es obligatorio para efectivo' });
    }
  }
  
  // Comprobante obligatorio para transferencia y efectivo
  const comprobanteFile = req.files?.comprobante?.[0];
  if ((metodo_pago === 'transferencia' || metodo_pago === 'efectivo') && !comprobanteFile) {
    return res.status(400).json({ error: 'El comprobante es obligatorio para transferencia o efectivo' });
  }
  // Documento de identificación obligatorio solo para nuevos estudiantes
  const documentoIdentificacionFile = req.files?.documento_identificacion?.[0];
  if (!id_estudiante_existente && !documentoIdentificacionFile) {
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

  // VALIDAR CUPOS DISPONIBLES Y BUSCAR CURSO ACTIVO CON HORARIO
  let cursoSeleccionado = null;
  try {
    const [cursosDisponibles] = await pool.execute(
      `SELECT id_curso, codigo_curso, nombre, horario, capacidad_maxima, cupos_disponibles 
       FROM cursos 
       WHERE id_tipo_curso = ? 
       AND horario = ? 
       AND estado = 'activo' 
       AND cupos_disponibles > 0
       ORDER BY fecha_inicio ASC
       LIMIT 1`,
      [id_tipo_curso, horario_preferido]
    );

    if (!cursosDisponibles.length) {
      return res.status(400).json({ 
        error: `No hay cupos disponibles para el horario ${horario_preferido}. Por favor, intenta con otro horario o contacta con la institución.` 
      });
    }

    cursoSeleccionado = cursosDisponibles[0];
    console.log(`✅ Curso seleccionado: ${cursoSeleccionado.nombre} (${cursoSeleccionado.horario}) - Cupos: ${cursoSeleccionado.cupos_disponibles}/${cursoSeleccionado.capacidad_maxima}`);
  } catch (e) {
    console.error('Error validando cupos disponibles:', e);
    return res.status(500).json({ error: 'Error verificando disponibilidad de cupos' });
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

  // USAR TRANSACCIÓN PARA GARANTIZAR CONSISTENCIA (insertar solicitud + restar cupo)
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // 1. INSERTAR SOLICITUD CON id_curso
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
      id_curso,
      monto_matricula,
      metodo_pago,
      numero_comprobante,
      banco_comprobante,
      fecha_transferencia,
      recibido_por,
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
      documento_estatus_legal_nombre_original,
      id_estudiante_existente
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      codigo,
      identificacion_solicitante,
      nombre_solicitante || null,
      apellido_solicitante || null,
      telefono_solicitante || null,
      email_solicitante || null,
      convertirFecha(fecha_nacimiento_solicitante),
      direccion_solicitante || null,
      genero_solicitante || null,
      horario_preferido,
      Number(id_tipo_curso),
      cursoSeleccionado.id_curso, // ID del curso seleccionado con cupos disponibles
      Number(monto_matricula),
      metodo_pago,
      numero_comprobante ? numero_comprobante.trim().toUpperCase() : null,
      banco_comprobante || null,
      convertirFecha(fecha_transferencia),
      recibido_por ? recibido_por.trim().toUpperCase() : null,
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
      documentoEstatusLegalNombreOriginal,
      id_estudiante_existente ? Number(id_estudiante_existente) : null
    ];

    const [result] = await connection.execute(sql, values);

    // 2. RESTAR 1 CUPO DEL CURSO SELECCIONADO
    await connection.execute(
      'UPDATE cursos SET cupos_disponibles = cupos_disponibles - 1 WHERE id_curso = ?',
      [cursoSeleccionado.id_curso]
    );

    console.log(`📉 Cupo restado del curso ${cursoSeleccionado.codigo_curso}. Cupos restantes: ${cursoSeleccionado.cupos_disponibles - 1}`);

    // 3. COMMIT DE LA TRANSACCIÓN
    await connection.commit();
    connection.release();

    // 4. ENVIAR EMAIL DE NOTIFICACIÓN AL ADMIN (asíncrono, no bloquea la respuesta)
    setImmediate(async () => {
      try {
        // Obtener nombre del tipo de curso para el email
        const [tipoCursoRows] = await pool.execute(
          'SELECT nombre FROM tipos_cursos WHERE id_tipo_curso = ?',
          [id_tipo_curso]
        );
        const nombreCurso = tipoCursoRows[0]?.nombre || 'Curso no especificado';

        const datosEmail = {
          codigo_solicitud: codigo,
          nombres: nombre_solicitante || 'N/A',
          apellidos: apellido_solicitante || 'N/A',
          email: email_solicitante || 'N/A',
          telefono: telefono_solicitante || 'N/A',
          nombre_curso: nombreCurso,
          metodo_pago: metodo_pago,
          monto_matricula: monto_matricula,
          fecha_solicitud: new Date()
        };

        await enviarNotificacionNuevaMatricula(datosEmail);
        console.log('✅ Email de notificación enviado al admin');
      } catch (emailError) {
        console.error('❌ Error enviando email de notificación (no afecta la solicitud):', emailError);
      }
    });

    return res.status(201).json({
      ok: true,
      id_solicitud: result.insertId,
      codigo_solicitud: codigo,
      curso: {
        id_curso: cursoSeleccionado.id_curso,
        nombre: cursoSeleccionado.nombre,
        horario: cursoSeleccionado.horario,
        cupos_restantes: cursoSeleccionado.cupos_disponibles - 1
      }
    });
  } catch (error) {
    // ROLLBACK en caso de error
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('Error al crear solicitud:', error);
    // Errores de FK u otros
    return res.status(500).json({ error: 'Error al registrar la solicitud' });
  }
};

exports.getSolicitudes = async (req, res) => {
  try {
    // Aggregated counters per estado
    if (req.query.aggregate === 'by_estado') {
      try {
        const tipo = req.query.tipo ? Number(req.query.tipo) : undefined;
        const result = await SolicitudesModel.getCountsByEstado(tipo);
        return res.json(result);
      } catch (e) {
        console.error('Error agregando conteos por estado:', e);
        return res.status(500).json({ error: 'Error obteniendo conteos' });
      }
    }

    const filters = {
      estado: typeof req.query.estado === 'string' && req.query.estado.length > 0
        ? req.query.estado
        : undefined,
      tipo: req.query.tipo ? Number(req.query.tipo) : undefined,
      page: Math.max(1, Number(req.query.page) || 1),
      limit: Math.max(1, Math.min(100, Number(req.query.limit) || 10))
    };

    const result = await SolicitudesModel.getAll(filters);
    const { solicitudes, total } = result;

    res.setHeader('X-Total-Count', String(total));
    return res.json(solicitudes);
  } catch (err) {
    console.error('Error listando solicitudes:', err);
    return res.status(500).json({ error: 'Error al listar solicitudes' });
  }
};

exports.getSolicitudById = async (req, res) => {
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
};

exports.getComprobante = async (req, res) => {
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
};

exports.getDocumentoIdentificacion = async (req, res) => {
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
};

exports.getDocumentoEstatusLegal = async (req, res) => {
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
};

exports.updateDecision = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const { estado, observaciones, verificado_por } = req.body;
    const estadosPermitidos = ['aprobado', 'rechazado', 'observaciones'];
    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    await connection.beginTransaction();

    // 1. Obtener información de la solicitud (incluyendo id_curso)
    const [solicitudRows] = await connection.execute(
      'SELECT id_curso, estado FROM solicitudes_matricula WHERE id_solicitud = ?',
      [id]
    );

    if (!solicitudRows.length) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const solicitud = solicitudRows[0];
    const estadoAnterior = solicitud.estado;

    // 2. Actualizar estado de la solicitud
    const sql = `
      UPDATE solicitudes_matricula
      SET estado = ?,
          observaciones = ?,
          verificado_por = ?,
          fecha_verificacion = NOW()
      WHERE id_solicitud = ?
    `;
    const params = [estado, observaciones || null, verificado_por || null, id];

    await connection.execute(sql, params);

    // 3. SI SE RECHAZA Y TIENE id_curso → SUMAR 1 CUPO DE VUELTA
    if (estado === 'rechazado' && solicitud.id_curso && estadoAnterior === 'pendiente') {
      await connection.execute(
        'UPDATE cursos SET cupos_disponibles = cupos_disponibles + 1 WHERE id_curso = ?',
        [solicitud.id_curso]
      );
      console.log(`📈 Cupo devuelto al curso ID ${solicitud.id_curso} por rechazo de solicitud ${id}`);
    }

    await connection.commit();
    connection.release();

    return res.json({ ok: true });
  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('Error actualizando decisión:', err);
    return res.status(500).json({ error: 'Error al actualizar la solicitud' });
  }
};
