const { pool } = require('../config/database');
const SolicitudesModel = require('../models/solicitudes.model');
const { enviarNotificacionNuevaMatricula } = require('../services/emailService');
const ExcelJS = require('exceljs');

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
    id_estudiante_existente,
    // Nuevo campo de contacto de emergencia
    contacto_emergencia
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

    // 1. INSERTAR SOLICITUD CON id_curso (32 columnas + contacto_emergencia = 33 total)
    const sql = `INSERT INTO solicitudes_matricula (
      codigo_solicitud,
      identificacion_solicitante,
      nombre_solicitante,
      apellido_solicitante,
      telefono_solicitante,
      email_solicitante,
      id_tipo_curso,
      id_curso,
      fecha_nacimiento_solicitante,
      direccion_solicitante,
      genero_solicitante,
      horario_preferido,
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
      id_estudiante_existente,
      contacto_emergencia
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      codigo,
      identificacion_solicitante,
      nombre_solicitante || null,
      apellido_solicitante || null,
      telefono_solicitante || null,
      email_solicitante || null,
      Number(id_tipo_curso),
      cursoSeleccionado.id_curso, // ID del curso seleccionado con cupos disponibles
      convertirFecha(fecha_nacimiento_solicitante),
      direccion_solicitante || null,
      genero_solicitante || null,
      horario_preferido,
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
      id_estudiante_existente ? Number(id_estudiante_existente) : null,
      contacto_emergencia || null
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
        console.error('-Error enviando email de notificación (no afecta la solicitud):', emailError);
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

// Generar reporte Excel de solicitudes
exports.generarReporteExcel = async (req, res) => {
  try {
    // 1. Obtener todas las solicitudes aprobadas con información completa
    const [solicitudesAprobadas] = await pool.execute(`
      SELECT 
        s.codigo_solicitud,
        s.identificacion_solicitante,
        s.nombre_solicitante,
        s.apellido_solicitante,
        s.email_solicitante,
        s.telefono_solicitante,
        s.fecha_nacimiento_solicitante,
        s.genero_solicitante,
        s.horario_preferido,
        tc.nombre AS tipo_curso,
        c.nombre AS curso_nombre,
        c.codigo_curso,
        c.horario AS horario_curso,
        s.monto_matricula,
        s.metodo_pago,
        s.fecha_solicitud,
        s.contacto_emergencia
      FROM solicitudes_matricula s
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = s.id_tipo_curso
      LEFT JOIN cursos c ON c.id_curso = s.id_curso
      WHERE s.estado = 'aprobado'
      ORDER BY s.fecha_solicitud DESC
    `);

    // 1.5 Obtener todas las solicitudes rechazadas
    const [solicitudesRechazadas] = await pool.execute(`
      SELECT 
        s.codigo_solicitud,
        s.identificacion_solicitante,
        s.nombre_solicitante,
        s.apellido_solicitante,
        s.email_solicitante,
        s.telefono_solicitante,
        s.horario_preferido,
        tc.nombre AS tipo_curso,
        c.nombre AS curso_nombre,
        s.monto_matricula,
        s.fecha_solicitud,
        s.observaciones
      FROM solicitudes_matricula s
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = s.id_tipo_curso
      LEFT JOIN cursos c ON c.id_curso = s.id_curso
      WHERE s.estado = 'rechazado'
      ORDER BY s.fecha_solicitud DESC
    `);

    // 2. Obtener resumen estadístico
    const [resumenGeneral] = await pool.execute(`
      SELECT 
        COUNT(CASE WHEN estado = 'aprobado' THEN 1 END) as total_aprobadas,
        COUNT(CASE WHEN estado = 'rechazado' THEN 1 END) as total_rechazadas,
        COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as total_pendientes,
        COUNT(CASE WHEN estado = 'observaciones' THEN 1 END) as total_observaciones,
        COUNT(*) as total_solicitudes
      FROM solicitudes_matricula
    `);

    // 3. Obtener resumen por curso
    const [resumenPorCurso] = await pool.execute(`
      SELECT 
        c.codigo_curso,
        c.nombre AS curso_nombre,
        c.horario,
        tc.nombre AS tipo_curso,
        COUNT(s.id_solicitud) as total_estudiantes
      FROM cursos c
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = c.id_tipo_curso
      LEFT JOIN solicitudes_matricula s ON s.id_curso = c.id_curso AND s.estado = 'aprobado'
      GROUP BY c.id_curso, c.codigo_curso, c.nombre, c.horario, tc.nombre
      HAVING total_estudiantes > 0
      ORDER BY total_estudiantes DESC
    `);

    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SGA Belleza';
    workbook.created = new Date();

    // ========== HOJA 1: SOLICITUDES APROBADAS ==========
    const sheet1 = workbook.addWorksheet('Solicitudes Aprobadas', {
      properties: { tabColor: { argb: 'FFDC2626' } }
    });

    // Encabezados Hoja 1
    sheet1.columns = [
      { header: 'Código', key: 'codigo', width: 18 },
      { header: 'Cédula', key: 'cedula', width: 12 },
      { header: 'Nombres', key: 'nombres', width: 20 },
      { header: 'Apellidos', key: 'apellidos', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Teléfono', key: 'telefono', width: 12 },
      { header: 'Fecha Nacimiento', key: 'fecha_nac', width: 15 },
      { header: 'Género', key: 'genero', width: 12 },
      { header: 'Tipo Curso', key: 'tipo_curso', width: 20 },
      { header: 'Curso', key: 'curso', width: 25 },
      { header: 'Código Curso', key: 'codigo_curso', width: 15 },
      { header: 'Horario Preferido', key: 'horario_pref', width: 15 },
      { header: 'Horario Curso', key: 'horario_curso', width: 15 },
      { header: 'Monto', key: 'monto', width: 12 },
      { header: 'Método Pago', key: 'metodo_pago', width: 15 },
      { header: 'Contacto Emergencia', key: 'contacto_emerg', width: 15 },
      { header: 'Fecha Solicitud', key: 'fecha_sol', width: 18 }
    ];

    // Estilo del encabezado
    sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    sheet1.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDC2626' }
    };
    sheet1.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet1.getRow(1).height = 25;

    // Agregar datos
    solicitudesAprobadas.forEach(sol => {
      sheet1.addRow({
        codigo: sol.codigo_solicitud,
        cedula: sol.identificacion_solicitante,
        nombres: sol.nombre_solicitante,
        apellidos: sol.apellido_solicitante,
        email: sol.email_solicitante,
        telefono: sol.telefono_solicitante || 'N/A',
        fecha_nac: sol.fecha_nacimiento_solicitante ? new Date(sol.fecha_nacimiento_solicitante).toLocaleDateString('es-EC') : 'N/A',
        genero: sol.genero_solicitante || 'N/A',
        tipo_curso: sol.tipo_curso || 'N/A',
        curso: sol.curso_nombre || 'N/A',
        codigo_curso: sol.codigo_curso || 'N/A',
        horario_pref: sol.horario_preferido,
        horario_curso: sol.horario_curso || 'N/A',
        monto: `$${parseFloat(sol.monto_matricula).toFixed(2)}`,
        metodo_pago: sol.metodo_pago,
        contacto_emerg: sol.contacto_emergencia || 'N/A',
        fecha_sol: new Date(sol.fecha_solicitud).toLocaleString('es-EC')
      });
    });

    // Aplicar bordes y estilos alternados
    sheet1.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });
      
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' }
        };
      }
    });

    // ========== HOJA 2: SOLICITUDES RECHAZADAS ==========
    const sheet2 = workbook.addWorksheet('Solicitudes Rechazadas', {
      properties: { tabColor: { argb: 'FFEF4444' } }
    });

    // Encabezados Hoja 2
    sheet2.columns = [
      { header: 'Código', key: 'codigo', width: 18 },
      { header: 'Cédula', key: 'cedula', width: 12 },
      { header: 'Nombres', key: 'nombres', width: 20 },
      { header: 'Apellidos', key: 'apellidos', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Teléfono', key: 'telefono', width: 12 },
      { header: 'Tipo Curso', key: 'tipo_curso', width: 20 },
      { header: 'Curso', key: 'curso', width: 25 },
      { header: 'Horario', key: 'horario', width: 15 },
      { header: 'Monto', key: 'monto', width: 12 },
      { header: 'Fecha Solicitud', key: 'fecha_sol', width: 18 },
      { header: 'Observaciones', key: 'observaciones', width: 40 }
    ];

    // Estilo del encabezado
    sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    sheet2.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEF4444' }
    };
    sheet2.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet2.getRow(1).height = 25;

    // Agregar datos rechazados
    solicitudesRechazadas.forEach(sol => {
      sheet2.addRow({
        codigo: sol.codigo_solicitud,
        cedula: sol.identificacion_solicitante,
        nombres: sol.nombre_solicitante,
        apellidos: sol.apellido_solicitante,
        email: sol.email_solicitante,
        telefono: sol.telefono_solicitante || 'N/A',
        tipo_curso: sol.tipo_curso || 'N/A',
        curso: sol.curso_nombre || 'N/A',
        horario: sol.horario_preferido,
        monto: `$${parseFloat(sol.monto_matricula).toFixed(2)}`,
        fecha_sol: new Date(sol.fecha_solicitud).toLocaleString('es-EC'),
        observaciones: sol.observaciones || 'Sin observaciones'
      });
    });

    // Aplicar bordes y estilos alternados
    sheet2.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });
      
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF2F2' }
        };
      }
    });

    // ========== HOJA 3: RESUMEN ESTADÍSTICO ==========
    const sheet3 = workbook.addWorksheet('Resumen Estadístico', {
      properties: { tabColor: { argb: 'FF10B981' } }
    });

    // Título principal con diseño profesional
    sheet3.mergeCells('A1:F1');
    sheet3.getCell('A1').value = 'REPORTE ESTADÍSTICO DE MATRÍCULAS';
    sheet3.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    sheet3.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDC2626' }
    };
    sheet3.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet3.getRow(1).height = 35;

    // Subtítulo con fecha
    sheet3.mergeCells('A2:F2');
    sheet3.getCell('A2').value = `Generado el: ${new Date().toLocaleDateString('es-EC', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
    sheet3.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
    sheet3.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet3.getRow(2).height = 20;

    // Sección 1: Resumen General
    sheet3.mergeCells('A4:B4');
    sheet3.getCell('A4').value = 'RESUMEN GENERAL DE SOLICITUDES';
    sheet3.getCell('A4').font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
    sheet3.getCell('A4').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF2F2' }
    };
    sheet3.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet3.getRow(4).height = 25;

    // Encabezados
    sheet3.getCell('A6').value = 'Estado';
    sheet3.getCell('B6').value = 'Cantidad';
    sheet3.getCell('C6').value = 'Porcentaje';
    ['A6', 'B6', 'C6'].forEach(cell => {
      sheet3.getCell(cell).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      sheet3.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
      sheet3.getCell(cell).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const stats = resumenGeneral[0];
    const total = stats.total_solicitudes;
    
    // Datos con porcentajes
    const datosEstadisticos = [
      { estado: '✓ Aprobadas', cantidad: stats.total_aprobadas, color: 'FF10B981' },
      { estado: '✗ Rechazadas', cantidad: stats.total_rechazadas, color: 'FFEF4444' },
      { estado: '⏳ Pendientes', cantidad: stats.total_pendientes, color: 'FFF59E0B' },
      { estado: '⚠ Con Observaciones', cantidad: stats.total_observaciones, color: 'FFFBBF24' }
    ];

    let row = 7;
    datosEstadisticos.forEach(dato => {
      const porcentaje = total > 0 ? ((dato.cantidad / total) * 100).toFixed(1) : '0.0';
      sheet3.getCell(`A${row}`).value = dato.estado;
      sheet3.getCell(`B${row}`).value = dato.cantidad;
      sheet3.getCell(`C${row}`).value = `${porcentaje}%`;
      
      sheet3.getCell(`B${row}`).alignment = { horizontal: 'center' };
      sheet3.getCell(`C${row}`).alignment = { horizontal: 'center' };
      sheet3.getCell(`C${row}`).font = { bold: true, color: { argb: dato.color } };
      
      row++;
    });

    // Total
    sheet3.getCell(`A${row}`).value = 'TOTAL';
    sheet3.getCell(`B${row}`).value = total;
    sheet3.getCell(`C${row}`).value = '100%';
    ['A', 'B', 'C'].forEach(col => {
      sheet3.getCell(`${col}${row}`).font = { bold: true, size: 11 };
      sheet3.getCell(`${col}${row}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' }
      };
    });
    sheet3.getCell(`B${row}`).alignment = { horizontal: 'center' };
    sheet3.getCell(`C${row}`).alignment = { horizontal: 'center' };

    // Sección 2: Estudiantes por Curso
    const startRow = row + 3;
    sheet3.mergeCells(`A${startRow}:E${startRow}`);
    sheet3.getCell(`A${startRow}`).value = 'DISTRIBUCIÓN DE ESTUDIANTES POR CURSO';
    sheet3.getCell(`A${startRow}`).font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
    sheet3.getCell(`A${startRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF2F2' }
    };
    sheet3.getCell(`A${startRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet3.getRow(startRow).height = 25;

    // Encabezados tabla cursos
    const headerRow = startRow + 2;
    sheet3.getCell(`A${headerRow}`).value = 'Código';
    sheet3.getCell(`B${headerRow}`).value = 'Nombre del Curso';
    sheet3.getCell(`C${headerRow}`).value = 'Tipo';
    sheet3.getCell(`D${headerRow}`).value = 'Horario';
    sheet3.getCell(`E${headerRow}`).value = 'Estudiantes';

    ['A', 'B', 'C', 'D', 'E'].forEach(col => {
      sheet3.getCell(`${col}${headerRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      sheet3.getCell(`${col}${headerRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
      sheet3.getCell(`${col}${headerRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Datos por curso
    let cursoRow = headerRow + 1;
    resumenPorCurso.forEach((curso, index) => {
      sheet3.getCell(`A${cursoRow}`).value = curso.codigo_curso;
      sheet3.getCell(`B${cursoRow}`).value = curso.curso_nombre;
      sheet3.getCell(`C${cursoRow}`).value = curso.tipo_curso;
      sheet3.getCell(`D${cursoRow}`).value = curso.horario;
      sheet3.getCell(`E${cursoRow}`).value = curso.total_estudiantes;
      
      sheet3.getCell(`E${cursoRow}`).alignment = { horizontal: 'center' };
      sheet3.getCell(`E${cursoRow}`).font = { bold: true, color: { argb: 'FF10B981' } };
      
      // Filas alternadas
      if (index % 2 === 0) {
        ['A', 'B', 'C', 'D', 'E'].forEach(col => {
          sheet3.getCell(`${col}${cursoRow}`).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }
          };
        });
      }
      
      cursoRow++;
    });

    // Ajustar anchos
    sheet3.getColumn('A').width = 15;
    sheet3.getColumn('B').width = 40;
    sheet3.getColumn('C').width = 25;
    sheet3.getColumn('D').width = 15;
    sheet3.getColumn('E').width = 15;
    sheet3.getColumn('F').width = 5;

    // Aplicar bordes a resumen general
    for (let i = 6; i <= row; i++) {
      ['A', 'B', 'C'].forEach(col => {
        sheet3.getCell(`${col}${i}`).border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });
    }

    // Aplicar bordes a tabla de cursos
    for (let i = headerRow; i < cursoRow; i++) {
      ['A', 'B', 'C', 'D', 'E'].forEach(col => {
        sheet3.getCell(`${col}${i}`).border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });
    }

    // Generar archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const fecha = new Date().toISOString().split('T')[0];
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Matriculas_${fecha}.xlsx`);
    res.send(buffer);

  } catch (error) {
    console.error('Error generando reporte Excel:', error);
    res.status(500).json({ error: 'Error al generar el reporte', details: error.message });
  }
};
