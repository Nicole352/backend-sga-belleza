const { pool } = require('../config/database');
const { registrarAuditoria } = require('../utils/auditoria');
const AsistenciasModel = require('../models/asistencias.model');
const cloudinaryService = require('../services/cloudinary.service');
const { generarExcelAsistenciaFecha, generarExcelAsistenciaRango } = require('../services/asistenciasExcelService');

// GET /api/asistencias/cursos-docente/:id_docente
// Obtener todos los cursos que imparte un docente
async function getCursosDocenteController(req, res) {
  try {
    const id_docente = Number(req.params.id_docente);
    if (!id_docente) {
      return res.status(400).json({ error: 'ID de docente inválido' });
    }

    const [cursos] = await pool.execute(`
      SELECT 
        c.id_curso,
        c.codigo_curso,
        c.nombre AS nombre_curso,
        c.horario,
        c.fecha_inicio,
        c.fecha_fin,
        c.estado,
        tc.nombre AS tipo_curso_nombre,
        aa.hora_inicio,
        aa.hora_fin,
        COUNT(DISTINCT ec.id_estudiante) AS total_estudiantes
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      LEFT JOIN estudiante_curso ec ON c.id_curso = ec.id_curso 
        AND ec.estado IN ('inscrito', 'activo')
      WHERE aa.id_docente = ?
        AND aa.estado = 'activa'
        AND c.estado IN ('activo', 'planificado', 'cancelado')
      GROUP BY c.id_curso, c.codigo_curso, c.nombre, c.horario, 
               c.fecha_inicio, c.fecha_fin, c.estado, tc.nombre, aa.hora_inicio, aa.hora_fin
      ORDER BY c.fecha_inicio DESC, c.nombre
    `, [id_docente]);

    return res.json({ success: true, cursos });
  } catch (err) {
    console.error('Error obteniendo cursos del docente:', err);
    return res.status(500).json({ error: 'Error al obtener cursos del docente' });
  }
}

// GET /api/asistencias/estudiantes/:id_curso
// Obtener estudiantes inscritos en un curso específico
async function getEstudiantesCursoController(req, res) {
  try {
    const id_curso = Number(req.params.id_curso);
    if (!id_curso) {
      return res.status(400).json({ error: 'ID de curso inválido' });
    }

    const [estudiantes] = await pool.execute(`
      SELECT 
        u.id_usuario AS id_estudiante,
        u.cedula,
        u.nombre,
        u.apellido,
        u.email,
        m.estado AS estado_inscripcion,
        m.fecha_matricula AS fecha_inscripcion
      FROM matriculas m
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE m.id_curso = ?
        AND m.estado = 'activa'
        AND r.nombre_rol = 'estudiante'
        AND u.estado = 'activo'
      ORDER BY u.apellido, u.nombre
    `, [id_curso]);

    return res.json({ success: true, estudiantes });
  } catch (err) {
    console.error('Error obteniendo estudiantes del curso:', err);
    return res.status(500).json({ error: 'Error al obtener estudiantes del curso' });
  }
}

// GET /api/asistencias/curso/:id_curso/fecha/:fecha
// O GET /api/asistencias/curso/:id_curso/rango?fecha_inicio=X&fecha_fin=Y
// Obtener asistencia de un curso por fecha o rango de fechas
async function getAsistenciaByFechaController(req, res) {
  try {
    const id_curso = Number(req.params.id_curso);
    const fecha = req.params.fecha; // Para fecha única
    const fecha_inicio = req.query.fecha_inicio; // Para rango
    const fecha_fin = req.query.fecha_fin; // Para rango

    if (!id_curso) {
      return res.status(400).json({ error: 'ID de curso requerido' });
    }

    let query = `
      SELECT 
        a.id_asistencia,
        a.id_estudiante,
        a.estado,
        a.observaciones,
        a.justificacion,
        a.hora_registro,
        a.fecha,
        a.documento_justificacion_url,
        a.documento_justificacion_public_id,
        (CASE WHEN a.documento_justificacion_url IS NOT NULL THEN 1 ELSE 0 END) AS tiene_documento,
        u.nombre,
        u.apellido,
        u.cedula
      FROM asistencias a
      INNER JOIN usuarios u ON a.id_estudiante = u.id_usuario
      WHERE a.id_curso = ?
    `;

    const params = [id_curso];

    if (fecha) {
      // Consulta por fecha específica
      query += ` AND a.fecha = ?`;
      params.push(fecha);
    } else if (fecha_inicio && fecha_fin) {
      // Consulta por rango de fechas
      query += ` AND a.fecha BETWEEN ? AND ?`;
      params.push(fecha_inicio, fecha_fin);
    } else {
      return res.status(400).json({
        error: 'Se requiere fecha específica o rango (fecha_inicio y fecha_fin)'
      });
    }

    query += ` ORDER BY a.fecha DESC, u.apellido, u.nombre`;

    const [asistencias] = await pool.execute(query, params);

    return res.json({ success: true, asistencias });
  } catch (err) {
    console.error('Error obteniendo asistencia:', err);
    return res.status(500).json({ error: 'Error al obtener asistencia' });
  }
}

// POST /api/asistencias
// Guardar o actualizar múltiples registros de asistencia
async function guardarAsistenciaController(req, res) {
  const connection = await pool.getConnection();

  try {
    // Parsear el JSON que viene en el campo 'data'
    let bodyData;
    if (req.body.data) {
      bodyData = JSON.parse(req.body.data);
    } else {
      bodyData = req.body;
    }

    const { id_curso, id_docente, fecha, asistencias } = bodyData;

    if (!id_curso || !id_docente || !fecha || !Array.isArray(asistencias)) {
      return res.status(400).json({
        error: 'Datos incompletos: se requiere id_curso, id_docente, fecha y array de asistencias'
      });
    }

    await connection.beginTransaction();

    const resultados = [];

    for (const registro of asistencias) {
      const { id_estudiante, estado, observaciones } = registro;

      // Buscar archivo adjunto para este registro si existe
      let documento_url = null;
      let documento_public_id = null;

      if (req.files && req.files.length > 0) {
        // Buscar archivo para este estudiante específico
        const archivoEstudiante = req.files.find(file =>
          file.fieldname === `documento_${id_estudiante}`
        );

        if (archivoEstudiante) {
          // Subir a Cloudinary
          try {
            console.log('Subiendo justificación a Cloudinary');
            const cloudinaryResult = await cloudinaryService.uploadFile(
              archivoEstudiante.buffer,
              'asistencias',
              `justificacion-${id_estudiante}-${fecha}-${Date.now()}`
            );
            console.log('Justificación subida:', cloudinaryResult.secure_url);

            documento_url = cloudinaryResult.secure_url;
            documento_public_id = cloudinaryResult.public_id;
          } catch (cloudinaryError) {
            console.error('Error subiendo a Cloudinary:', cloudinaryError);
            // Continuar sin documento si falla Cloudinary
          }
        }
      }

      if (!id_estudiante || !estado) {
        continue;
      }

      // La justificación viene en el campo observaciones cuando el estado es 'justificado'
      const justificacion = (estado === 'justificado' && observaciones) ? observaciones : null;

      // Intentar insertar, si ya existe actualizar (UPSERT)
      let query = `
        INSERT INTO asistencias 
          (id_curso, id_estudiante, id_docente, fecha, estado, observaciones, justificacion
      `;

      const params = [id_curso, id_estudiante, id_docente, fecha, estado,
        observaciones || null, justificacion];

      // Agregar campos de documento si están presentes
      if (documento_url) {
        query += `, documento_justificacion_url, documento_justificacion_public_id`;
        params.push(documento_url, documento_public_id);
      }

      query += `)
        VALUES (?, ?, ?, ?, ?, ?, ?`;

      if (documento_url) {
        query += `, ?, ?`;
      }

      query += `)
        ON DUPLICATE KEY UPDATE
          estado = VALUES(estado),
          observaciones = VALUES(observaciones),
          justificacion = VALUES(justificacion),
          fecha_actualizacion = CURRENT_TIMESTAMP`;

      // Actualizar campos de documento si están presentes
      if (documento_url) {
        query += `,
          documento_justificacion_url = VALUES(documento_justificacion_url),
          documento_justificacion_public_id = VALUES(documento_justificacion_public_id)`;
      }

      const [result] = await connection.execute(query, params);

      resultados.push({
        id_estudiante,
        success: result.affectedRows > 0
      });
    }

    // Obtener nombre del curso para auditoría
    let nombreCurso = null;
    try {
      const [cursoInfo] = await pool.execute('SELECT nombre FROM cursos WHERE id_curso = ?', [id_curso]);
      nombreCurso = cursoInfo[0]?.nombre || null;
    } catch (e) {
      console.error('Error obteniendo nombre del curso para auditoría:', e);
    }

    // Contar estados
    const presentes = asistencias.filter(a => a.estado === 'presente').length;
    const ausentes = asistencias.filter(a => a.estado === 'ausente').length;
    const justificados = asistencias.filter(a => a.estado === 'justificado').length;
    const tardanzas = asistencias.filter(a => a.estado === 'tardanza').length;

    // Registrar auditoría
    await registrarAuditoria({
      tabla_afectada: 'asistencias',
      operacion: 'INSERT',
      id_registro: id_curso,
      usuario_id: req.user?.id_usuario || id_docente,
      datos_nuevos: {
        id_curso,
        nombre_curso: nombreCurso,
        fecha,
        total_estudiantes: asistencias.length,
        presentes,
        ausentes,
        justificados,
        tardanzas
      },
      ip_address: req.ip || '0.0.0.0',
      user_agent: req.get('user-agent') || 'unknown'
    });

    await connection.commit();

    return res.json({
      success: true,
      message: 'Asistencia guardada correctamente',
      resultados
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error guardando asistencia:', err);
    return res.status(500).json({ error: 'Error al guardar asistencia' });
  } finally {
    connection.release();
  }
}

// GET /api/asistencias/estudiante/:id_estudiante/curso/:id_curso
// Obtener historial de asistencia de un estudiante en un curso
async function getHistorialEstudianteController(req, res) {
  try {
    const id_estudiante = Number(req.params.id_estudiante);
    const id_curso = Number(req.params.id_curso);

    if (!id_estudiante || !id_curso) {
      return res.status(400).json({ error: 'ID de estudiante y curso son requeridos' });
    }

    const [historial] = await pool.execute(`
      SELECT 
        a.id_asistencia,
        a.fecha,
        a.estado,
        a.observaciones,
        a.justificacion,
        a.hora_registro,
        a.documento_justificacion_url,
        a.documento_justificacion_public_id,
        (CASE WHEN a.documento_justificacion_url IS NOT NULL THEN 1 ELSE 0 END) AS tiene_documento,
        CONCAT(d.nombres, ' ', d.apellidos) AS docente_nombre
      FROM asistencias a
      INNER JOIN docentes d ON a.id_docente = d.id_docente
      WHERE a.id_estudiante = ? AND a.id_curso = ?
      ORDER BY a.fecha DESC
    `, [id_estudiante, id_curso]);

    // Calcular estadísticas
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) AS total_clases,
        SUM(CASE WHEN estado = 'presente' THEN 1 ELSE 0 END) AS total_presentes,
        SUM(CASE WHEN estado = 'ausente' THEN 1 ELSE 0 END) AS total_ausentes,
        SUM(CASE WHEN estado = 'tardanza' THEN 1 ELSE 0 END) AS total_tardanzas,
        SUM(CASE WHEN estado = 'justificado' THEN 1 ELSE 0 END) AS total_justificados,
        ROUND((SUM(CASE WHEN estado = 'presente' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) AS porcentaje_asistencia
      FROM asistencias
      WHERE id_estudiante = ? AND id_curso = ?
    `, [id_estudiante, id_curso]);

    return res.json({
      success: true,
      historial,
      estadisticas: stats[0] || {}
    });
  } catch (err) {
    console.error('Error obteniendo historial de asistencia:', err);
    return res.status(500).json({ error: 'Error al obtener historial de asistencia' });
  }
}

// GET /api/asistencias/reporte/:id_curso
// Obtener reporte completo de asistencia de un curso
async function getReporteCursoController(req, res) {
  try {
    const id_curso = Number(req.params.id_curso);
    const fecha_inicio = req.query.fecha_inicio;
    const fecha_fin = req.query.fecha_fin;

    if (!id_curso) {
      return res.status(400).json({ error: 'ID de curso requerido' });
    }

    let query = `
      SELECT 
        u.id_usuario AS id_estudiante,
        u.cedula,
        CONCAT(u.apellido, ', ', u.nombre) AS nombre_completo,
        COUNT(a.id_asistencia) AS total_clases_registradas,
        SUM(CASE WHEN a.estado = 'presente' THEN 1 ELSE 0 END) AS total_presentes,
        SUM(CASE WHEN a.estado = 'ausente' THEN 1 ELSE 0 END) AS total_ausentes,
        SUM(CASE WHEN a.estado = 'tardanza' THEN 1 ELSE 0 END) AS total_tardanzas,
        SUM(CASE WHEN a.estado = 'justificado' THEN 1 ELSE 0 END) AS total_justificados,
        ROUND((SUM(CASE WHEN a.estado = 'presente' THEN 1 ELSE 0 END) * 100.0 / 
               NULLIF(COUNT(a.id_asistencia), 0)), 2) AS porcentaje_asistencia
      FROM estudiante_curso ec
      INNER JOIN usuarios u ON ec.id_estudiante = u.id_usuario
      LEFT JOIN asistencias a ON a.id_estudiante = u.id_usuario AND a.id_curso = ?
    `;

    const params = [id_curso];

    if (fecha_inicio && fecha_fin) {
      query += ` AND a.fecha BETWEEN ? AND ?`;
      params.push(fecha_inicio, fecha_fin);
    }

    query += `
      WHERE ec.id_curso = ?
        AND ec.estado IN ('inscrito', 'activo')
      GROUP BY u.id_usuario, u.cedula, u.apellido, u.nombre
      ORDER BY u.apellido, u.nombre
    `;
    params.push(id_curso);

    const [reporte] = await pool.execute(query, params);

    return res.json({ success: true, reporte });
  } catch (err) {
    console.error('Error generando reporte de asistencia:', err);
    return res.status(500).json({ error: 'Error al generar reporte de asistencia' });
  }
}

// GET /api/asistencias/excel/fecha/:id_curso/:fecha
// Generar Excel de asistencia para una fecha específica
async function generarExcelFechaController(req, res) {
  try {
    const id_curso = Number(req.params.id_curso);
    const fecha = req.params.fecha;

    if (!id_curso || !fecha) {
      return res.status(400).json({ error: 'ID de curso y fecha son requeridos' });
    }

    // Obtener información del curso
    const [cursos] = await pool.execute(`
      SELECT 
        c.id_curso,
        c.nombre AS nombre_curso,
        c.horario,
        tc.nombre AS tipo_curso_nombre,
        aa.hora_inicio,
        aa.hora_fin,
        CONCAT(d.apellidos, ', ', d.nombres) AS nombre_docente
      FROM cursos c
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      LEFT JOIN asignaciones_aulas aa ON c.id_curso = aa.id_curso AND aa.estado = 'activa'
      LEFT JOIN docentes d ON aa.id_docente = d.id_docente
      WHERE c.id_curso = ?
      LIMIT 1
    `, [id_curso]);

    if (cursos.length === 0) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const curso = cursos[0];

    // Obtener estudiantes del curso (ordenados alfabéticamente) - Consistent with getEstudiantesCursoController
    const [estudiantes] = await pool.execute(`
      SELECT 
        u.id_usuario AS id_estudiante,
        u.cedula,
        u.nombre,
        u.apellido,
        u.email
      FROM matriculas m
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      WHERE m.id_curso = ?
        AND m.estado = 'activa'
        AND u.estado = 'activo'
      ORDER BY u.apellido, u.nombre
    `, [id_curso]);

    // Obtener asistencias de la fecha
    const [asistencias] = await pool.execute(`
      SELECT 
        a.id_asistencia,
        a.id_estudiante,
        a.estado,
        a.observaciones
      FROM asistencias a
      WHERE a.id_curso = ? AND a.fecha = ?
    `, [id_curso, fecha]);

    // Importar el servicio de Excel
    const { generarExcelAsistenciaFecha } = require('../services/asistenciasExcelService');

    // Generar Excel
    const buffer = await generarExcelAsistenciaFecha({
      cursoNombre: curso.nombre_curso,
      cursoActual: {
        horario: curso.horario,
        hora_inicio: curso.hora_inicio,
        hora_fin: curso.hora_fin,
        tipo_curso_nombre: curso.tipo_curso_nombre
      },
      nombreDocente: curso.nombre_docente || 'Sin asignar',
      fechaSeleccionada: fecha,
      estudiantes,
      asistencias
    });

    // Configurar headers para descarga
    const nombreCurso = curso.nombre_curso.replace(/\s+/g, '_');
    const nombreArchivo = `Asistencia_${nombreCurso}_${fecha}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.setHeader('Content-Length', buffer.length);

    return res.send(buffer);
  } catch (err) {
    console.error('Error generando Excel de asistencia:', err);
    return res.status(500).json({ error: 'Error al generar Excel de asistencia' });
  }
}

// GET /api/asistencias/excel/rango/:id_curso?fecha_inicio=X&fecha_fin=Y
// Generar Excel de asistencia para un rango de fechas
async function generarExcelRangoController(req, res) {
  try {
    console.log('[Excel Rango] Iniciando generación con:', req.params, req.query);
    const id_curso = Number(req.params.id_curso);
    const fecha_inicio = req.query.fecha_inicio;
    const fecha_fin = req.query.fecha_fin;

    if (!id_curso || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({
        error: 'ID de curso, fecha_inicio y fecha_fin son requeridos'
      });
    }

    // Validar que fecha_inicio <= fecha_fin
    if (new Date(fecha_inicio) > new Date(fecha_fin)) {
      return res.status(400).json({
        error: 'La fecha de inicio debe ser anterior o igual a la fecha fin'
      });
    }

    // Obtener información del curso
    const [cursos] = await pool.execute(`
      SELECT 
        c.id_curso,
        c.nombre AS nombre_curso,
        c.horario,
        tc.nombre AS tipo_curso_nombre,
        aa.hora_inicio,
        aa.hora_fin,
        CONCAT(d.apellidos, ', ', d.nombres) AS nombre_docente
      FROM cursos c
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      LEFT JOIN asignaciones_aulas aa ON c.id_curso = aa.id_curso AND aa.estado = 'activa'
      LEFT JOIN docentes d ON aa.id_docente = d.id_docente
      WHERE c.id_curso = ?
      LIMIT 1
    `, [id_curso]);

    if (cursos.length === 0) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const curso = cursos[0];

    // Obtener estudiantes del curso (ordenados alfabéticamente) - Consistent with getEstudiantesCursoController
    const [estudiantes] = await pool.execute(`
      SELECT 
        u.id_usuario AS id_estudiante,
        u.cedula,
        u.nombre,
        u.apellido,
        u.email
      FROM matriculas m
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      WHERE m.id_curso = ?
        AND m.estado = 'activa'
        AND u.estado = 'activo'
      ORDER BY u.apellido, u.nombre
    `, [id_curso]);

    // Obtener asistencias del rango de fechas
    // Ajustar fecha fin para incluir todo el día
    const fechaFinQuery = `${fecha_fin} 23:59:59`;

    console.log(`[Excel Rango] Consultando asistencias curso ${id_curso} desde ${fecha_inicio} hasta ${fechaFinQuery}`);

    const [registros] = await pool.execute(`
      SELECT 
        a.id_asistencia,
        a.id_estudiante,
        a.fecha,
        a.estado,
        a.observaciones
      FROM asistencias a
      WHERE a.id_curso = ? 
        AND a.fecha >= ? AND a.fecha <= ?
      ORDER BY a.fecha, a.id_estudiante
    `, [id_curso, fecha_inicio, fechaFinQuery]);

    console.log(`[Excel Rango] Registros encontrados: ${registros.length}`);

    if (registros.length === 0) {
      return res.status(404).json({
        error: 'No hay registros de asistencia en este rango de fechas'
      });
    }

    // Importar el servicio de Excel
    const { generarExcelAsistenciaRango } = require('../services/asistenciasExcelService');

    // Generar Excel

    const buffer = await generarExcelAsistenciaRango({
      cursoNombre: curso.nombre_curso,
      cursoActual: {
        horario: curso.horario,
        hora_inicio: curso.hora_inicio,
        hora_fin: curso.hora_fin,
        tipo_curso_nombre: curso.tipo_curso_nombre
      },
      nombreDocente: curso.nombre_docente || 'Sin asignar',
      fechaInicio: fecha_inicio,
      fechaFin: fecha_fin,
      estudiantes,
      registros
    });

    // Configurar headers para descarga
    // Limpiar nombre del curso de caracteres problemáticos
    const nombreCursoLimip = (curso.nombre_curso || 'Curso').replace(/[^a-zA-Z0-9]/g, '_');
    const nombreArchivo = `Reporte_Asistencia_${nombreCursoLimip}_${fecha_inicio}_a_${fecha_fin}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    // res.setHeader('Content-Length', buffer.length); // Comentado para evitar problemas de hang en clientes

    console.log(`[Excel Rango] Enviando archivo: ${nombreArchivo} (${buffer.length} bytes)`);

    return res.status(200).end(buffer, 'binary');

  } catch (err) {
    console.error('Error generando Excel de asistencia por rango:', err);
    return res.status(500).json({ error: 'Error al generar Excel de asistencia' });
  }
}

module.exports = {
  getCursosDocenteController,
  getEstudiantesCursoController,
  getAsistenciaByFechaController,
  guardarAsistenciaController,
  getHistorialEstudianteController,
  getReporteCursoController,
  generarExcelFechaController,
  generarExcelRangoController
};
