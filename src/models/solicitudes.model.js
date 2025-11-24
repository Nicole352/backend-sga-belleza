const { pool } = require('../config/database');

class SolicitudesModel {
  // Crear nueva solicitud (solo Cloudinary - sin LONGBLOB)
  static async create(solicitudData, archivos) {
    const {
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
      id_estudiante_existente,
      contacto_emergencia,
      id_promocion_seleccionada
    } = solicitudData;

    const {
      comprobanteUrl,
      comprobantePublicId,
      documentoIdentificacionUrl,
      documentoIdentificacionPublicId,
      documentoEstatusLegalUrl,
      documentoEstatusLegalPublicId,
      certificadoCosmetologiaUrl,
      certificadoCosmetologiaPublicId
    } = archivos;

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
      comprobante_pago_url,
      comprobante_pago_public_id,
      documento_identificacion_url,
      documento_identificacion_public_id,
      documento_estatus_legal_url,
      documento_estatus_legal_public_id,
      certificado_cosmetologia_url,
      certificado_cosmetologia_public_id,
      id_estudiante_existente,
      contacto_emergencia,
      id_promocion_seleccionada
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      codigo_solicitud,
      identificacion_solicitante,
      nombre_solicitante || null,
      apellido_solicitante || null,
      telefono_solicitante || null,
      email_solicitante,
      fecha_nacimiento_solicitante || null,
      direccion_solicitante || null,
      genero_solicitante || null,
      horario_preferido,
      Number(id_tipo_curso),
      id_curso ? Number(id_curso) : null,
      Number(monto_matricula),
      metodo_pago,
      numero_comprobante ? numero_comprobante.trim().toUpperCase() : null,
      banco_comprobante || null,
      fecha_transferencia || null,
      recibido_por ? recibido_por.trim().toUpperCase() : null,
      comprobanteUrl || null,
      comprobantePublicId || null,
      documentoIdentificacionUrl || null,
      documentoIdentificacionPublicId || null,
      documentoEstatusLegalUrl || null,
      documentoEstatusLegalPublicId || null,
      certificadoCosmetologiaUrl || null,
      certificadoCosmetologiaPublicId || null,
      id_estudiante_existente ? Number(id_estudiante_existente) : null,
      contacto_emergencia || null,
      id_promocion_seleccionada ? Number(id_promocion_seleccionada) : null
    ];

    const [result] = await pool.execute(sql, values);
    return result.insertId;
  }

  // Obtener todas las solicitudes con filtros
  static async getAll(filters = {}) {
    const { estado, tipo, page = 1, limit = 10 } = filters;
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
        s.fecha_transferencia,
        s.recibido_por,
        s.id_estudiante_existente,
        s.comprobante_pago_url,
        s.documento_identificacion_url,
        s.documento_estatus_legal_url,
        s.certificado_cosmetologia_url,
        s.verificado_por,
        s.fecha_verificacion,
        CONCAT(u.nombre, ' ', u.apellido) AS verificado_por_nombre
      FROM solicitudes_matricula s
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = s.id_tipo_curso
      LEFT JOIN usuarios u ON u.id_usuario = s.verificado_por
      WHERE 1=1
    `;
    const params = [];

    if (estado) {
      sql += ' AND s.estado = ?';
      params.push(estado);
    }
    if (tipo) {
      sql += ' AND s.id_tipo_curso = ?';
      params.push(tipo);
    }

    // Evitar placeholders en LIMIT/OFFSET para compatibilidad
    sql += ` ORDER BY s.fecha_solicitud DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

    // Total count with same filters
    let sqlCount = `SELECT COUNT(*) AS total FROM solicitudes_matricula s WHERE 1=1`;
    const paramsCount = [];
    if (estado) {
      sqlCount += ' AND s.estado = ?';
      paramsCount.push(estado);
    }
    if (tipo) {
      sqlCount += ' AND s.id_tipo_curso = ?';
      paramsCount.push(tipo);
    }

    const [[countRow]] = await pool.execute(sqlCount, paramsCount);
    const totalCount = Number(countRow?.total || 0);

    const [rows] = await pool.execute(sql, params);

    return {
      solicitudes: rows,
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalCount / parseInt(limit))
    };
  }

  // Obtener conteos por estado
  static async getCountsByEstado(tipo = null) {
    let sqlAgg = `SELECT s.estado, COUNT(*) AS total FROM solicitudes_matricula s WHERE 1=1`;
    const paramsAgg = [];

    if (tipo) {
      sqlAgg += ' AND s.id_tipo_curso = ?';
      paramsAgg.push(tipo);
    }

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

    return result;
  }

  // Obtener solicitud por ID
  static async getById(id) {
    const [rows] = await pool.execute(`
      SELECT 
        s.*, 
        tc.nombre AS tipo_curso_nombre
      FROM solicitudes_matricula s
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = s.id_tipo_curso
      WHERE s.id_solicitud = ?
    `, [id]);

    return rows.length > 0 ? rows[0] : null;
  }

  // Obtener solicitud pendiente por ID
  static async getPendienteById(id) {
    const [solicitudes] = await pool.execute(`
      SELECT 
        s.*,
        tc.nombre AS tipo_curso_nombre
      FROM solicitudes_matricula s
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = s.id_tipo_curso
      WHERE s.id_solicitud = ? AND s.estado = 'pendiente'
    `, [id]);

    return solicitudes.length > 0 ? solicitudes[0] : null;
  }

  // NOTA: Los archivos ahora se almacenan en Cloudinary
  // Las URLs están disponibles en los campos:
  // - comprobante_pago_url
  // - documento_identificacion_url
  // - documento_estatus_legal_url
  // - certificado_cosmetologia_url

  // Actualizar decisión de solicitud
  static async updateDecision(id, decisionData) {
    const { estado, observaciones, verificado_por } = decisionData;

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
    return result.affectedRows > 0;
  }

  // Verificar si existe número de comprobante
  static async existsNumeroComprobante(numero_comprobante) {
    const [existingRows] = await pool.execute(
      'SELECT id_solicitud FROM solicitudes_matricula WHERE numero_comprobante = ?',
      [numero_comprobante.trim().toUpperCase()]
    );

    return existingRows.length > 0;
  }

  // Validar tipo de curso
  static async validateTipoCurso(id_tipo_curso) {
    const [tipoCursoRows] = await pool.execute(
      'SELECT id_tipo_curso, estado, card_key, nombre FROM tipos_cursos WHERE id_tipo_curso = ?',
      [id_tipo_curso]
    );

    if (tipoCursoRows.length === 0) {
      return { valid: false, message: 'El tipo de curso no existe' };
    }

    const tipoCurso = tipoCursoRows[0];
    if (tipoCurso.estado !== 'activo') {
      return { valid: false, message: 'El tipo de curso no está disponible para matrícula' };
    }

    return { valid: true, tipoCurso };
  }
}

module.exports = SolicitudesModel;
