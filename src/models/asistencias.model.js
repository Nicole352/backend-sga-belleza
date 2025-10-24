const { pool } = require('../config/database');

class AsistenciasModel {
  
  // Obtener cursos que imparte un docente
  static async getCursosByDocente(id_docente) {
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
        COUNT(DISTINCT ec.id_estudiante) AS total_estudiantes
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      LEFT JOIN estudiante_curso ec ON c.id_curso = ec.id_curso 
        AND ec.estado IN ('inscrito', 'activo')
      WHERE aa.id_docente = ?
        AND aa.estado = 'activa'
        AND c.estado IN ('activo', 'planificado')
      GROUP BY c.id_curso, c.codigo_curso, c.nombre, c.horario, 
               c.fecha_inicio, c.fecha_fin, c.estado, tc.nombre
      ORDER BY c.fecha_inicio DESC, c.nombre
    `, [id_docente]);
    
    return cursos;
  }

  // Obtener estudiantes de un curso
  static async getEstudiantesByCurso(id_curso) {
    const [estudiantes] = await pool.execute(`
      SELECT 
        u.id_usuario AS id_estudiante,
        u.cedula,
        u.nombre,
        u.apellido,
        u.email,
        ec.estado AS estado_inscripcion,
        ec.fecha_inscripcion
      FROM estudiante_curso ec
      INNER JOIN usuarios u ON ec.id_estudiante = u.id_usuario
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE ec.id_curso = ?
        AND ec.estado IN ('inscrito', 'activo')
        AND r.nombre_rol = 'estudiante'
        AND u.estado = 'activo'
      ORDER BY u.apellido, u.nombre
    `, [id_curso]);
    
    return estudiantes;
  }

  // Obtener asistencia por curso y fecha
  static async getByFecha(id_curso, fecha) {
    const [asistencias] = await pool.execute(`
      SELECT 
        a.id_asistencia,
        a.id_estudiante,
        a.estado,
        a.observaciones,
        a.justificacion,
        a.hora_registro,
        u.nombre,
        u.apellido,
        u.cedula
      FROM asistencias a
      INNER JOIN usuarios u ON a.id_estudiante = u.id_usuario
      WHERE a.id_curso = ? AND a.fecha = ?
      ORDER BY u.apellido, u.nombre
    `, [id_curso, fecha]);
    
    return asistencias;
  }

  // Guardar o actualizar un registro de asistencia
  static async save(asistenciaData) {
    const {
      id_curso,
      id_estudiante,
      id_docente,
      fecha,
      estado,
      observaciones = null,
      justificacion = null
    } = asistenciaData;

    const [result] = await pool.execute(`
      INSERT INTO asistencias 
        (id_curso, id_estudiante, id_docente, fecha, estado, observaciones, justificacion)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        estado = VALUES(estado),
        observaciones = VALUES(observaciones),
        justificacion = VALUES(justificacion),
        fecha_actualizacion = CURRENT_TIMESTAMP
    `, [id_curso, id_estudiante, id_docente, fecha, estado, observaciones, justificacion]);

    return result.affectedRows > 0;
  }

  // Guardar múltiples registros de asistencia (transacción)
  static async saveMultiple(id_curso, id_docente, fecha, asistencias) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      for (const registro of asistencias) {
        const { id_estudiante, estado, observaciones, justificacion } = registro;

        await connection.execute(`
          INSERT INTO asistencias 
            (id_curso, id_estudiante, id_docente, fecha, estado, observaciones, justificacion)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            estado = VALUES(estado),
            observaciones = VALUES(observaciones),
            justificacion = VALUES(justificacion),
            fecha_actualizacion = CURRENT_TIMESTAMP
        `, [id_curso, id_estudiante, id_docente, fecha, estado, observaciones || null, justificacion || null]);
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Obtener historial de asistencia de un estudiante en un curso
  static async getHistorialEstudiante(id_estudiante, id_curso) {
    const [historial] = await pool.execute(`
      SELECT 
        a.id_asistencia,
        a.fecha,
        a.estado,
        a.observaciones,
        a.justificacion,
        a.hora_registro,
        CONCAT(d.nombres, ' ', d.apellidos) AS docente_nombre
      FROM asistencias a
      INNER JOIN docentes d ON a.id_docente = d.id_docente
      WHERE a.id_estudiante = ? AND a.id_curso = ?
      ORDER BY a.fecha DESC
    `, [id_estudiante, id_curso]);

    return historial;
  }

  // Obtener estadísticas de asistencia de un estudiante en un curso
  static async getEstadisticasEstudiante(id_estudiante, id_curso) {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) AS total_clases,
        SUM(CASE WHEN estado = 'presente' THEN 1 ELSE 0 END) AS total_presentes,
        SUM(CASE WHEN estado = 'ausente' THEN 1 ELSE 0 END) AS total_ausentes,
        SUM(CASE WHEN estado = 'tardanza' THEN 1 ELSE 0 END) AS total_tardanzas,
        SUM(CASE WHEN estado = 'justificado' THEN 1 ELSE 0 END) AS total_justificados,
        ROUND((SUM(CASE WHEN estado = 'presente' THEN 1 ELSE 0 END) * 100.0 / 
               NULLIF(COUNT(*), 0)), 2) AS porcentaje_asistencia
      FROM asistencias
      WHERE id_estudiante = ? AND id_curso = ?
    `, [id_estudiante, id_curso]);

    return stats.length > 0 ? stats[0] : null;
  }

  // Obtener reporte de asistencia de un curso
  static async getReporteCurso(id_curso, fecha_inicio = null, fecha_fin = null) {
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
    return reporte;
  }

  // Verificar si existe asistencia para un curso y fecha
  static async existeAsistencia(id_curso, fecha) {
    const [result] = await pool.execute(`
      SELECT COUNT(*) as count 
      FROM asistencias 
      WHERE id_curso = ? AND fecha = ?
    `, [id_curso, fecha]);
    
    return result[0].count > 0;
  }

  // Eliminar asistencia (por si se necesita)
  static async delete(id_asistencia) {
    const [result] = await pool.execute(
      'DELETE FROM asistencias WHERE id_asistencia = ?',
      [id_asistencia]
    );
    return result.affectedRows > 0;
  }

  // Obtener asistencia por ID
  static async getById(id_asistencia) {
    const [asistencias] = await pool.execute(`
      SELECT 
        a.*,
        u.nombre,
        u.apellido,
        u.cedula,
        c.nombre AS curso_nombre,
        CONCAT(d.nombres, ' ', d.apellidos) AS docente_nombre
      FROM asistencias a
      INNER JOIN usuarios u ON a.id_estudiante = u.id_usuario
      INNER JOIN cursos c ON a.id_curso = c.id_curso
      INNER JOIN docentes d ON a.id_docente = d.id_docente
      WHERE a.id_asistencia = ?
    `, [id_asistencia]);

    return asistencias.length > 0 ? asistencias[0] : null;
  }
}

module.exports = AsistenciasModel;
