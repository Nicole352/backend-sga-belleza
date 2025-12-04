const { pool } = require('../config/database');

class AsignacionesAulasModel {
  // Obtener todas las asignaciones con información completa
  static async getAll(filters = {}) {
    const { page = 1, limit = 10, estado = '', id_aula = '', id_curso = '', id_docente = '' } = filters;
    const offset = (page - 1) * limit;
    
    let sql = `
      SELECT 
        aa.id_asignacion,
        aa.id_aula,
        aa.id_curso,
        aa.id_docente,
        aa.hora_inicio,
        aa.hora_fin,
        aa.dias,
        aa.estado,
        aa.observaciones,
        aa.fecha_creacion,
        aa.fecha_actualizacion,
        -- Datos del aula
        a.codigo_aula,
        a.nombre AS aula_nombre,
        a.ubicacion,
        a.estado AS aula_estado,
        -- Datos del curso (incluye fechas y capacidad)
        c.codigo_curso,
        c.nombre AS curso_nombre,
        c.fecha_inicio,
        c.fecha_fin,
        c.capacidad_maxima,
        c.estado AS curso_estado,
        -- Datos del tipo de curso
        tc.nombre AS tipo_curso_nombre,
        -- Datos del docente
        d.nombres AS docente_nombres,
        d.apellidos AS docente_apellidos,
        d.identificacion AS docente_identificacion,
        -- Calcular ocupación
        (SELECT COUNT(*) 
         FROM matriculas m 
         WHERE m.id_curso = c.id_curso 
         AND m.estado = 'activa') AS estudiantes_matriculados,
        -- Calcular porcentaje de ocupación
        ROUND(((SELECT COUNT(*) 
                FROM matriculas m 
                WHERE m.id_curso = c.id_curso 
                AND m.estado = 'activa') / c.capacidad_maxima) * 100, 0) AS porcentaje_ocupacion
      FROM asignaciones_aulas aa
      INNER JOIN aulas a ON aa.id_aula = a.id_aula
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      INNER JOIN docentes d ON aa.id_docente = d.id_docente
      WHERE 1=1
    `;
    
    const params = [];
    
    if (estado) {
      sql += ' AND aa.estado = ?';
      params.push(estado);
    }
    
    if (id_aula) {
      sql += ' AND aa.id_aula = ?';
      params.push(id_aula);
    }
    
    if (id_curso) {
      sql += ' AND aa.id_curso = ?';
      params.push(id_curso);
    }
    
    if (id_docente) {
      sql += ' AND aa.id_docente = ?';
      params.push(id_docente);
    }
    
    sql += ` ORDER BY c.fecha_inicio DESC, aa.hora_inicio ASC LIMIT ${limit} OFFSET ${offset}`;
    
    const [asignaciones] = await pool.execute(sql, params);
    
    // Consulta de total
    let sqlCount = `
      SELECT COUNT(*) as total 
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      WHERE 1=1
    `;
    
    const paramsCount = [];
    
    if (estado) {
      sqlCount += ' AND aa.estado = ?';
      paramsCount.push(estado);
    }
    
    if (id_aula) {
      sqlCount += ' AND aa.id_aula = ?';
      paramsCount.push(id_aula);
    }
    
    if (id_curso) {
      sqlCount += ' AND aa.id_curso = ?';
      paramsCount.push(id_curso);
    }
    
    if (id_docente) {
      sqlCount += ' AND aa.id_docente = ?';
      paramsCount.push(id_docente);
    }
    
    const [[{ total }]] = await pool.execute(sqlCount, paramsCount);
    
    return {
      asignaciones,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    };
  }

  // Obtener asignación por ID
  static async getById(id) {
    const [asignaciones] = await pool.execute(`
      SELECT 
        aa.*,
        a.codigo_aula,
        a.nombre AS aula_nombre,
        a.ubicacion,
        c.codigo_curso,
        c.nombre AS curso_nombre,
        c.fecha_inicio,
        c.fecha_fin,
        c.capacidad_maxima,
        tc.nombre AS tipo_curso_nombre,
        d.nombres AS docente_nombres,
        d.apellidos AS docente_apellidos,
        d.identificacion AS docente_identificacion
      FROM asignaciones_aulas aa
      INNER JOIN aulas a ON aa.id_aula = a.id_aula
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      INNER JOIN docentes d ON aa.id_docente = d.id_docente
      WHERE aa.id_asignacion = ?
    `, [id]);
    
    return asignaciones.length > 0 ? asignaciones[0] : null;
  }

  // Verificar conflictos de horario (solo conflictos reales, no uso de la misma aula)
  static async verificarConflictos(id_aula, hora_inicio, hora_fin, dias, exclude_id = null) {
    const diasArray = dias.split(',').map(d => d.trim());
    const diasConditions = diasArray.map(() => `
      (FIND_IN_SET(?, aa.dias) > 0)
    `).join(' OR ');
    
    let sql = `
      SELECT 
        aa.id_asignacion,
        aa.hora_inicio,
        aa.hora_fin,
        aa.dias,
        c.nombre AS curso_nombre,
        c.fecha_inicio,
        c.fecha_fin,
        CONCAT(d.nombres, ' ', d.apellidos) AS docente
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      INNER JOIN docentes d ON aa.id_docente = d.id_docente
      WHERE aa.id_aula = ? 
        AND aa.estado = 'activa'
        AND c.estado IN ('planificado', 'activo')
        AND (
          -- Verificar solapamiento real de horarios (no solo uso de aula)
          -- Conflicto si: hora_inicio nueva está dentro del rango existente
          (TIME(?) > TIME(aa.hora_inicio) AND TIME(?) < TIME(aa.hora_fin)) OR
          -- Conflicto si: hora_fin nueva está dentro del rango existente  
          (TIME(?) > TIME(aa.hora_inicio) AND TIME(?) < TIME(aa.hora_fin)) OR
          -- Conflicto si: el rango nuevo contiene completamente el existente
          (TIME(?) <= TIME(aa.hora_inicio) AND TIME(?) >= TIME(aa.hora_fin)) OR
          -- Conflicto si: el rango existente contiene completamente el nuevo
          (TIME(aa.hora_inicio) <= TIME(?) AND TIME(aa.hora_fin) >= TIME(?))
        )
        AND (${diasConditions})
    `;
    
    const params = [
      id_aula, 
      hora_inicio, hora_inicio, // Para primera condición
      hora_fin, hora_fin,       // Para segunda condición  
      hora_inicio, hora_fin,    // Para tercera condición
      hora_inicio, hora_fin,    // Para cuarta condición
      ...diasArray
    ];
    
    if (exclude_id) {
      sql += ' AND aa.id_asignacion != ?';
      params.push(exclude_id);
    }
    
    const [conflictos] = await pool.execute(sql, params);
    return conflictos;
  }

  // Verificar conflictos de horario para un docente (mismo docente en múltiples aulas al mismo tiempo)
  static async verificarConflictosDocente(id_docente, hora_inicio, hora_fin, dias, exclude_id = null) {
    const diasArray = dias.split(',').map(d => d.trim());
    const diasConditions = diasArray.map(() => `
      (FIND_IN_SET(?, aa.dias) > 0)
    `).join(' OR ');
    
    let sql = `
      SELECT 
        aa.id_asignacion,
        aa.hora_inicio,
        aa.hora_fin,
        aa.dias,
        c.nombre AS curso_nombre,
        aula.nombre AS aula_nombre,
        aula.ubicacion AS aula_ubicacion
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      INNER JOIN aulas aula ON aa.id_aula = aula.id_aula
      WHERE aa.id_docente = ? 
        AND aa.estado = 'activa'
        AND c.estado IN ('planificado', 'activo')
        AND (
          -- Verificar solapamiento de horarios
          (TIME(?) > TIME(aa.hora_inicio) AND TIME(?) < TIME(aa.hora_fin)) OR
          (TIME(?) > TIME(aa.hora_inicio) AND TIME(?) < TIME(aa.hora_fin)) OR
          (TIME(?) <= TIME(aa.hora_inicio) AND TIME(?) >= TIME(aa.hora_fin)) OR
          (TIME(aa.hora_inicio) <= TIME(?) AND TIME(aa.hora_fin) >= TIME(?))
        )
        AND (${diasConditions})
    `;
    
    const params = [
      id_docente,
      hora_inicio, hora_inicio,
      hora_fin, hora_fin,
      hora_inicio, hora_fin,
      hora_inicio, hora_fin,
      ...diasArray
    ];
    
    if (exclude_id) {
      sql += ' AND aa.id_asignacion != ?';
      params.push(exclude_id);
    }
    
    const [conflictos] = await pool.execute(sql, params);
    return conflictos;
  }

  // Verificar conflictos de horario para un curso (mismo curso en múltiples aulas al mismo tiempo)
  static async verificarConflictosCurso(id_curso, hora_inicio, hora_fin, dias, exclude_id = null) {
    const diasArray = dias.split(',').map(d => d.trim());
    const diasConditions = diasArray.map(() => `
      (FIND_IN_SET(?, aa.dias) > 0)
    `).join(' OR ');
    
    let sql = `
      SELECT 
        aa.id_asignacion,
        aa.hora_inicio,
        aa.hora_fin,
        aa.dias,
        aula.nombre AS aula_nombre,
        aula.ubicacion AS aula_ubicacion,
        CONCAT(d.nombres, ' ', d.apellidos) AS docente
      FROM asignaciones_aulas aa
      INNER JOIN aulas aula ON aa.id_aula = aula.id_aula
      INNER JOIN docentes d ON aa.id_docente = d.id_docente
      WHERE aa.id_curso = ? 
        AND aa.estado = 'activa'
        AND (
          -- Verificar solapamiento de horarios
          (TIME(?) > TIME(aa.hora_inicio) AND TIME(?) < TIME(aa.hora_fin)) OR
          (TIME(?) > TIME(aa.hora_inicio) AND TIME(?) < TIME(aa.hora_fin)) OR
          (TIME(?) <= TIME(aa.hora_inicio) AND TIME(?) >= TIME(aa.hora_fin)) OR
          (TIME(aa.hora_inicio) <= TIME(?) AND TIME(aa.hora_fin) >= TIME(?))
        )
        AND (${diasConditions})
    `;
    
    const params = [
      id_curso,
      hora_inicio, hora_inicio,
      hora_fin, hora_fin,
      hora_inicio, hora_fin,
      hora_inicio, hora_fin,
      ...diasArray
    ];
    
    if (exclude_id) {
      sql += ' AND aa.id_asignacion != ?';
      params.push(exclude_id);
    }
    
    const [conflictos] = await pool.execute(sql, params);
    return conflictos;
  }

  // Crear nueva asignación
  static async create(asignacionData) {
    const {
      id_aula,
      id_curso,
      id_docente,
      hora_inicio,
      hora_fin,
      dias,
      observaciones = null
    } = asignacionData;

    // Validar que el curso existe
    const [cursos] = await pool.execute(
      'SELECT id_curso, estado FROM cursos WHERE id_curso = ?',
      [id_curso]
    );

    if (cursos.length === 0) {
      throw new Error('El curso especificado no existe');
    }

    // Validar que el aula existe
    const [aulas] = await pool.execute(
      'SELECT id_aula, estado FROM aulas WHERE id_aula = ?',
      [id_aula]
    );

    if (aulas.length === 0) {
      throw new Error('El aula especificada no existe');
    }

    if (aulas[0].estado !== 'activa') {
      throw new Error('El aula no está disponible');
    }

    // Validar que el docente existe
    const [docentes] = await pool.execute(
      'SELECT id_docente FROM docentes WHERE id_docente = ?',
      [id_docente]
    );

    if (docentes.length === 0) {
      throw new Error('El docente especificado no existe');
    }

    // Verificar conflictos de horario del aula
    const conflictos = await this.verificarConflictos(id_aula, hora_inicio, hora_fin, dias);
    
    if (conflictos.length > 0) {
      const conflicto = conflictos[0];
      throw new Error(
        `Conflicto de horario: El aula ya está ocupada por el curso "${conflicto.curso_nombre}" ` +
        `con el docente ${conflicto.docente} en el horario ${conflicto.hora_inicio}-${conflicto.hora_fin}. ` +
        `La misma aula puede usarse para otros cursos en horarios diferentes.`
      );
    }

    // Verificar conflictos de horario del docente (mismo docente en múltiples aulas)
    const conflictosDocente = await this.verificarConflictosDocente(id_docente, hora_inicio, hora_fin, dias);
    
    if (conflictosDocente.length > 0) {
      const conflicto = conflictosDocente[0];
      throw new Error(
        `Conflicto de horario del docente: Ya tiene asignada una clase del curso "${conflicto.curso_nombre}" ` +
        `en el aula "${conflicto.aula_nombre}" en el horario ${conflicto.hora_inicio}-${conflicto.hora_fin}. ` +
        `Un docente no puede estar en dos aulas al mismo tiempo.`
      );
    }

    // Verificar conflictos de horario del curso (mismo curso en múltiples aulas)
    const conflictosCurso = await this.verificarConflictosCurso(id_curso, hora_inicio, hora_fin, dias);
    
    if (conflictosCurso.length > 0) {
      const conflicto = conflictosCurso[0];
      throw new Error(
        `Conflicto de horario del curso: Ya está asignado en el aula "${conflicto.aula_nombre}" ` +
        `con el docente ${conflicto.docente} en el horario ${conflicto.hora_inicio}-${conflicto.hora_fin}. ` +
        `Un curso no puede dictarse en dos aulas simultáneamente.`
      );
    }

    const [result] = await pool.execute(`
      INSERT INTO asignaciones_aulas (
        id_aula, id_curso, id_docente, hora_inicio, hora_fin, dias, observaciones, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'activa')
    `, [id_aula, id_curso, id_docente, hora_inicio, hora_fin, dias, observaciones]);

    return result.insertId;
  }

  // Actualizar asignación
  static async update(id, asignacionData) {
    const {
      id_aula,
      id_curso,
      id_docente,
      hora_inicio,
      hora_fin,
      dias,
      estado,
      observaciones
    } = asignacionData;

    // Obtener los datos actuales de la asignación para tener valores de referencia
    const asignacionActual = await this.getById(id);
    if (!asignacionActual) {
      throw new Error('Asignación no encontrada');
    }

    // Usar los valores nuevos o los existentes para la validación
    const aulaFinal = id_aula !== undefined ? id_aula : asignacionActual.id_aula;
    const cursoFinal = id_curso !== undefined ? id_curso : asignacionActual.id_curso;
    const docenteFinal = id_docente !== undefined ? id_docente : asignacionActual.id_docente;
    const horaInicioFinal = hora_inicio !== undefined ? hora_inicio : asignacionActual.hora_inicio;
    const horaFinFinal = hora_fin !== undefined ? hora_fin : asignacionActual.hora_fin;
    const diasFinal = dias !== undefined ? dias : asignacionActual.dias;

    // Verificar conflictos de horario del aula (excluyendo la asignación actual)
    const conflictosAula = await this.verificarConflictos(aulaFinal, horaInicioFinal, horaFinFinal, diasFinal, id);
    
    if (conflictosAula.length > 0) {
      const conflicto = conflictosAula[0];
      throw new Error(
        `Conflicto de horario: El aula ya está ocupada por el curso "${conflicto.curso_nombre}" ` +
        `con el docente ${conflicto.docente} en el horario ${conflicto.hora_inicio}-${conflicto.hora_fin}. ` +
        `La misma aula puede usarse para otros cursos en horarios diferentes.`
      );
    }

    // Verificar conflictos de horario del docente
    const conflictosDocente = await this.verificarConflictosDocente(docenteFinal, horaInicioFinal, horaFinFinal, diasFinal, id);
    
    if (conflictosDocente.length > 0) {
      const conflicto = conflictosDocente[0];
      throw new Error(
        `Conflicto de horario del docente: Ya tiene asignada una clase del curso "${conflicto.curso_nombre}" ` +
        `en el aula "${conflicto.aula_nombre}" en el horario ${conflicto.hora_inicio}-${conflicto.hora_fin}. ` +
        `Un docente no puede estar en dos aulas al mismo tiempo.`
      );
    }

    // Verificar conflictos de horario del curso
    const conflictosCurso = await this.verificarConflictosCurso(cursoFinal, horaInicioFinal, horaFinFinal, diasFinal, id);
    
    if (conflictosCurso.length > 0) {
      const conflicto = conflictosCurso[0];
      throw new Error(
        `Conflicto de horario del curso: Ya está asignado en el aula "${conflicto.aula_nombre}" ` +
        `con el docente ${conflicto.docente} en el horario ${conflicto.hora_inicio}-${conflicto.hora_fin}. ` +
        `Un curso no puede dictarse en dos aulas simultáneamente.`
      );
    }

    const fields = [];
    const values = [];

    if (id_aula !== undefined) {
      fields.push('id_aula = ?');
      values.push(id_aula);
    }
    if (id_curso !== undefined) {
      fields.push('id_curso = ?');
      values.push(id_curso);
    }
    if (id_docente !== undefined) {
      fields.push('id_docente = ?');
      values.push(id_docente);
    }
    if (hora_inicio !== undefined) {
      fields.push('hora_inicio = ?');
      values.push(hora_inicio);
    }
    if (hora_fin !== undefined) {
      fields.push('hora_fin = ?');
      values.push(hora_fin);
    }
    if (dias !== undefined) {
      fields.push('dias = ?');
      values.push(dias);
    }
    if (estado !== undefined) {
      fields.push('estado = ?');
      values.push(estado);
    }
    if (observaciones !== undefined) {
      fields.push('observaciones = ?');
      values.push(observaciones);
    }

    if (fields.length === 0) {
      return 0;
    }

    values.push(id);
    const [result] = await pool.execute(
      `UPDATE asignaciones_aulas SET ${fields.join(', ')} WHERE id_asignacion = ?`,
      values
    );

    return result.affectedRows;
  }

  // Eliminar asignación (cambiar estado a inactiva)
  static async delete(id) {
    const [result] = await pool.execute(
      'UPDATE asignaciones_aulas SET estado = ? WHERE id_asignacion = ?',
      ['cancelada', id]
    );

    return result.affectedRows;
  }

  // Obtener asignaciones por aula
  static async getByAula(id_aula) {
    const [asignaciones] = await pool.execute(`
      SELECT 
        aa.id_asignacion,
        aa.hora_inicio,
        aa.hora_fin,
        aa.dias,
        aa.estado,
        c.nombre AS curso_nombre,
        c.fecha_inicio,
        c.fecha_fin,
        c.capacidad_maxima,
        CONCAT(d.nombres, ' ', d.apellidos) AS docente,
        (SELECT COUNT(*) FROM matriculas m WHERE m.id_curso = c.id_curso AND m.estado = 'activa') AS matriculados
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      INNER JOIN docentes d ON aa.id_docente = d.id_docente
      WHERE aa.id_aula = ?
        AND aa.estado = 'activa'
        AND c.estado IN ('planificado', 'activo')
      ORDER BY c.fecha_inicio, aa.hora_inicio
    `, [id_aula]);

    return asignaciones;
  }

  // Obtener asignaciones por docente
  static async getByDocente(id_docente) {
    const [asignaciones] = await pool.execute(`
      SELECT 
        aa.id_asignacion,
        aa.hora_inicio,
        aa.hora_fin,
        aa.dias,
        aa.estado,
        a.nombre AS aula_nombre,
        a.ubicacion,
        c.nombre AS curso_nombre,
        c.fecha_inicio,
        c.fecha_fin,
        c.capacidad_maxima,
        (SELECT COUNT(*) FROM matriculas m WHERE m.id_curso = c.id_curso AND m.estado = 'activa') AS matriculados
      FROM asignaciones_aulas aa
      INNER JOIN aulas a ON aa.id_aula = a.id_aula
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      WHERE aa.id_docente = ?
        AND aa.estado = 'activa'
        AND c.estado IN ('planificado', 'activo')
      ORDER BY c.fecha_inicio, aa.hora_inicio
    `, [id_docente]);

    return asignaciones;
  }

  // Obtener estadísticas
  static async getStats() {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_asignaciones,
        SUM(CASE WHEN aa.estado = 'activa' THEN 1 ELSE 0 END) as asignaciones_activas,
        SUM(CASE WHEN aa.estado = 'inactiva' THEN 1 ELSE 0 END) as asignaciones_inactivas,
        SUM(CASE WHEN aa.estado = 'cancelada' THEN 1 ELSE 0 END) as asignaciones_canceladas,
        COUNT(DISTINCT aa.id_aula) as aulas_en_uso,
        COUNT(DISTINCT aa.id_docente) as docentes_asignados
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      WHERE c.estado IN ('planificado', 'activo')
    `);
    
    return stats[0];
  }
}

module.exports = AsignacionesAulasModel;
