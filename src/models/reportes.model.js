const { pool } = require('../config/database');

const ReportesModel = {
  /**
   * REPORTE DE ESTUDIANTES
   * Obtiene estudiantes matriculados en un período con filtros
   */
  async getReporteEstudiantes({ fechaInicio, fechaFin, estado, idCurso, horario }) {
    try {
      const CalificacionesModel = require('./calificaciones.model');

      let query = `
        SELECT 
          u.id_usuario,
          u.cedula,
          u.nombre,
          u.apellido,
          u.email,
          u.telefono,
          u.genero,
          u.fecha_nacimiento,
          u.direccion,
          u.fecha_registro,
          ec.fecha_inscripcion,
          ec.estado as estado_academico,
          ec.nota_final as nota_final_almacenada,
          ec.fecha_graduacion,
          c.id_curso,
          c.codigo_curso,
          c.nombre as nombre_curso,
          c.horario as horario_curso,
          tc.nombre as tipo_curso,
          tc.duracion_meses,
          m.codigo_matricula,
          m.monto_matricula,
          m.fecha_matricula,
          u.estado as estado_usuario,
          COALESCE(
            sm.contacto_emergencia,
            (SELECT contacto_emergencia 
             FROM solicitudes_matricula sm2 
             INNER JOIN matriculas m2 ON sm2.id_solicitud = m2.id_solicitud
             WHERE m2.id_estudiante = u.id_usuario 
             AND sm2.contacto_emergencia IS NOT NULL 
             AND sm2.contacto_emergencia != ''
             LIMIT 1)
          ) as telefono_emergencia
        FROM usuarios u
        INNER JOIN estudiante_curso ec ON u.id_usuario = ec.id_estudiante
        INNER JOIN cursos c ON ec.id_curso = c.id_curso
        INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
        INNER JOIN matriculas m ON m.id_estudiante = u.id_usuario AND m.id_curso = c.id_curso
        INNER JOIN solicitudes_matricula sm ON m.id_solicitud = sm.id_solicitud
        WHERE 1=1
      `;

      const params = [];

      if (fechaInicio && fechaFin) {
        query += ` AND DATE(ec.fecha_inscripcion) BETWEEN ? AND ?`;
        params.push(fechaInicio, fechaFin);
      }

      if (estado && estado !== 'todos') {
        if (estado === 'inactivo') {
          query += ` AND (u.estado = 'inactivo' OR ec.estado IN('inactivo', 'retirado'))`;
        } else if (estado === 'activo') {
          query += ` AND (u.estado = 'activo' AND ec.estado IN('activo', 'inscrito'))`;
        } else {
          query += ` AND ec.estado = ? `;
          params.push(estado);
        }
      }

      if (idCurso) {
        query += ` AND c.id_curso = ? `;
        params.push(idCurso);
      }

      if (horario && horario !== 'todos') {
        query += ` AND c.horario = ? `;
        params.push(horario);
      }

      query += ` ORDER BY ec.fecha_inscripcion DESC`;

      const [rows] = await pool.query(query, params);

      const rowsWithGrades = await Promise.all(
        rows.map(async (row) => {
          try {
            const promedioData = await CalificacionesModel.getPromedioGlobalBalanceado(
              row.id_usuario,
              row.id_curso
            );
            row.nota_final = promedioData.promedio_global || row.nota_final_almacenada || null;
          } catch (error) {
            console.error(`Error calculando promedio para estudiante ${row.id_usuario}:`, error);
            row.nota_final = row.nota_final_almacenada || null;
          }
          return row;
        })
      );

      return rowsWithGrades;
    } catch (error) {
      console.error('Error en getReporteEstudiantes:', error);
      throw error;
    }
  },

  /**
   * ESTADÍSTICAS DE ESTUDIANTES
   */
  async getEstadisticasEstudiantes({ fechaInicio, fechaFin, estado, idCurso, horario }) {
    try {
      let query = `
        SELECT
          COUNT(DISTINCT ec.id_estudiante) as total_estudiantes,
          COUNT(DISTINCT CASE WHEN u.estado = 'activo' AND ec.estado IN('activo', 'inscrito') THEN ec.id_estudiante END) as activos,
          COUNT(DISTINCT CASE WHEN ec.estado = 'aprobado' OR COALESCE(notas.promedio_calculado, ec.nota_final, 0) >= 7 THEN ec.id_estudiante END) as aprobados,
          COUNT(DISTINCT CASE WHEN ec.estado = 'reprobado' AND COALESCE(notas.promedio_calculado, ec.nota_final, 0) < 7 THEN ec.id_estudiante END) as reprobados,
          COUNT(DISTINCT CASE WHEN u.estado = 'inactivo' OR ec.estado IN('retirado', 'inactivo') THEN ec.id_estudiante END) as retirados,
          COUNT(DISTINCT CASE WHEN ec.estado = 'graduado' OR COALESCE(notas.promedio_calculado, ec.nota_final, 0) >= 7 THEN ec.id_estudiante END) as graduados,
          AVG(COALESCE(notas.promedio_calculado, ec.nota_final, 0)) as promedio_notas
        FROM estudiante_curso ec
        INNER JOIN usuarios u ON ec.id_estudiante = u.id_usuario
        INNER JOIN cursos c ON ec.id_curso = c.id_curso
        LEFT JOIN (
            SELECT 
                promedios.id_estudiante,
                promedios.id_curso,
                SUM(promedios.aporte_modulo) as promedio_calculado
            FROM (
                SELECT 
                    e.id_estudiante,
                    m.id_curso,
                    m.id_modulo,
                    COALESCE(SUM(COALESCE(c.nota, 0)) / NULLIF(COUNT(t.id_tarea), 0), 0) as promedio_modulo,
                    (COALESCE(SUM(COALESCE(c.nota, 0)) / NULLIF(COUNT(t.id_tarea), 0), 0) / 10.0) * (10.0 / (
                        SELECT COUNT(*) FROM modulos_curso WHERE id_curso = m.id_curso
                    )) as aporte_modulo
                FROM modulos_curso m
                LEFT JOIN tareas_modulo t ON m.id_modulo = t.id_modulo
                LEFT JOIN entregas_tareas e ON t.id_tarea = e.id_tarea
                LEFT JOIN calificaciones_tareas c ON e.id_entrega = c.id_entrega
                GROUP BY e.id_estudiante, m.id_curso, m.id_modulo
                HAVING e.id_estudiante IS NOT NULL
            ) as promedios
            GROUP BY promedios.id_estudiante, promedios.id_curso
        ) as notas ON notas.id_estudiante = ec.id_estudiante AND notas.id_curso = ec.id_curso
        WHERE 1=1
      `;

      const params = [];

      if (fechaInicio && fechaFin) {
        query += ` AND DATE(ec.fecha_inscripcion) BETWEEN ? AND ?`;
        params.push(fechaInicio, fechaFin);
      }

      if (estado && estado !== 'todos') {
        if (estado === 'inactivo') {
          query += ` AND (u.estado = 'inactivo' OR ec.estado IN('inactivo', 'retirado'))`;
        } else if (estado === 'activo') {
          query += ` AND (u.estado = 'activo' AND ec.estado IN('activo', 'inscrito'))`;
        } else {
          query += ` AND ec.estado = ? `;
          params.push(estado);
        }
      }

      if (idCurso) {
        query += ` AND c.id_curso = ? `;
        params.push(idCurso);
      }

      if (horario && horario !== 'todos') {
        query += ` AND c.horario = ? `;
        params.push(horario);
      }

      const [rows] = await pool.query(query, params);
      return rows[0];
    } catch (error) {
      console.error('Error en getEstadisticasEstudiantes:', error);
      throw error;
    }
  },

  /**
   * REPORTE FINANCIERO
   * Obtiene pagos realizados en un período con filtros
   */
  async getReporteFinanciero({ fechaInicio, fechaFin, tipoPago, estadoPago, idCurso, estadoCurso, metodoPago, horario }) {
    try {
      let query = `
        SELECT
          pm.id_pago,
          pm.numero_cuota,
          pm.monto,
          pm.fecha_vencimiento,
          pm.fecha_pago,
          pm.metodo_pago,
          pm.numero_comprobante,
          pm.banco_comprobante,
          pm.fecha_transferencia,
          pm.recibido_por,
          pm.estado as estado_pago,
          pm.observaciones,
          u.cedula as cedula_estudiante,
          u.nombre as nombre_estudiante,
          u.apellido as apellido_estudiante,
          u.email as email_estudiante,
          c.id_curso,
          c.codigo_curso,
          c.nombre as nombre_curso,
          c.horario,
          c.fecha_inicio,
          c.fecha_fin,
          c.estado as estado_curso,
          tc.nombre as tipo_curso,
          tc.modalidad_pago,
          m.codigo_matricula,
          m.monto_matricula,
          verificador.nombre as verificado_por_nombre,
          verificador.apellido as verificado_por_apellido,
          pm.fecha_verificacion
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
        INNER JOIN cursos c ON m.id_curso = c.id_curso
        INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
        LEFT JOIN usuarios verificador ON pm.verificado_por = verificador.id_usuario
        WHERE 1=1
      `;

      const params = [];

      if (fechaInicio && fechaFin) {
        query += ` AND DATE(COALESCE(pm.fecha_pago, pm.fecha_vencimiento)) BETWEEN ? AND ?`;
        params.push(fechaInicio, fechaFin);
      }

      if (idCurso) {
        query += ` AND c.id_curso = ? `;
        params.push(idCurso);
      }

      if (estadoCurso && estadoCurso !== 'todos') {
        if (estadoCurso === 'activo') {
          query += ` AND c.estado IN ('activo', 'cancelado') `;
        } else {
          query += ` AND c.estado = ? `;
          params.push(estadoCurso);
        }
      }

      if (horario && horario !== 'todos') {
        query += ` AND c.horario = ? `;
        params.push(horario);
      }

      if (tipoPago && tipoPago !== 'todos') {
        if (tipoPago === 'primer_mes') {
          query += ` AND pm.numero_cuota = 1`;
        } else if (tipoPago === 'mensualidad') {
          query += ` AND pm.numero_cuota > 1 AND tc.modalidad_pago = 'mensual'`;
        } else if (tipoPago === 'clase') {
          query += ` AND tc.modalidad_pago = 'clases'`;
        }
      }

      if (estadoPago && estadoPago !== 'todos') {
        query += ` AND pm.estado = ? `;
        params.push(estadoPago);
      }

      if (metodoPago && metodoPago !== 'todos') {
        query += ` AND pm.metodo_pago = ? `;
        params.push(metodoPago);
      }

      // Ordenar por Curso, luego Estudiante, luego Cuota
      query += ` ORDER BY c.nombre ASC, u.apellido ASC, u.nombre ASC, pm.numero_cuota ASC`;

      const [rows] = await pool.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error en getReporteFinanciero:', error);
      throw error;
    }
  },

  /**
   * ESTADÍSTICAS FINANCIERAS
   */
  async getEstadisticasFinancieras({ fechaInicio, fechaFin, idCurso, estadoCurso, horario, metodoPago, tipoPago }) {
    try {
      let query = `
        SELECT
          COUNT(*) as total_pagos,
          COUNT(CASE WHEN pm.estado = 'pagado' THEN 1 END) as pagos_realizados,
          COUNT(CASE WHEN pm.estado = 'verificado' THEN 1 END) as pagos_verificados,
          COUNT(CASE WHEN pm.estado = 'pendiente' THEN 1 END) as pagos_pendientes,
          COUNT(CASE WHEN pm.estado = 'vencido' THEN 1 END) as pagos_vencidos,
          SUM(CASE WHEN pm.estado IN('pagado', 'verificado') THEN pm.monto ELSE 0 END) as ingresos_totales,
          SUM(CASE WHEN pm.estado = 'pendiente' THEN pm.monto ELSE 0 END) as ingresos_pendientes,
          AVG(CASE WHEN pm.estado IN('pagado', 'verificado') THEN pm.monto END) as promedio_pago,
          COUNT(DISTINCT CASE WHEN pm.numero_cuota = 1 THEN pm.id_matricula END) as matriculas_pagadas
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        INNER JOIN cursos c ON m.id_curso = c.id_curso
        INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
        WHERE DATE(COALESCE(pm.fecha_pago, pm.fecha_vencimiento)) BETWEEN ? AND ?
      `;

      const params = [fechaInicio, fechaFin];

      if (idCurso) {
        query += ` AND c.id_curso = ?`;
        params.push(idCurso);
      }

      if (estadoCurso && estadoCurso !== 'todos') {
        query += ` AND c.estado = ?`;
        params.push(estadoCurso);
      }

      if (horario && horario !== 'todos') {
        query += ` AND c.horario = ?`;
        params.push(horario);
      }

      if (metodoPago && metodoPago !== 'todos') {
        query += ` AND pm.metodo_pago = ?`;
        params.push(metodoPago);
      }

      if (tipoPago && tipoPago !== 'todos') {
        if (tipoPago === 'primer_mes') {
          query += ` AND pm.numero_cuota = 1`;
        } else if (tipoPago === 'mensualidad') {
          query += ` AND pm.numero_cuota > 1 AND tc.modalidad_pago = 'mensual'`;
        } else if (tipoPago === 'clase') {
          query += ` AND tc.modalidad_pago = 'clases'`;
        }
      }

      const [rows] = await pool.query(query, params);
      return rows[0];
    } catch (error) {
      console.error('Error en getEstadisticasFinancieras:', error);
      throw error;
    }
  },

  /**
   * REPORTE DE CURSOS
   * Obtiene información de cursos con ocupación y popularidad
   */
  async getReporteCursos({ fechaInicio, fechaFin, estado, ocupacion, horario }) {
    try {
      let query = `
        SELECT
          c.id_curso,
          c.codigo_curso,
          c.nombre as nombre_curso,
          c.horario,
          c.capacidad_maxima,
          c.cupos_disponibles,
          c.fecha_inicio,
          c.fecha_fin,
          c.estado as estado_curso,
          tc.nombre as tipo_curso,
          tc.duracion_meses,
          tc.precio_base,
          tc.modalidad_pago,
          COUNT(DISTINCT ec.id_estudiante) as total_estudiantes,
          COUNT(DISTINCT CASE WHEN ec.estado = 'activo' THEN ec.id_estudiante END) as estudiantes_activos,
          COUNT(DISTINCT CASE WHEN ec.estado = 'graduado' THEN ec.id_estudiante END) as estudiantes_graduados,
          ROUND((COUNT(DISTINCT ec.id_estudiante) / c.capacidad_maxima) * 100, 2) as porcentaje_ocupacion,
          SUM(m.monto_matricula) as ingresos_matriculas,
          MAX(d.nombres) as docente_nombres,
          MAX(d.apellidos) as docente_apellidos,
          MAX(d.identificacion) as docente_identificacion,
          MAX(a.nombre) as aula_nombre,
          MAX(a.ubicacion) as aula_ubicacion,
          MAX(aa.hora_inicio) as hora_inicio,
          MAX(aa.hora_fin) as hora_fin,
          MAX(aa.dias) as dias
        FROM cursos c
        INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
        LEFT JOIN estudiante_curso ec ON c.id_curso = ec.id_curso
        LEFT JOIN matriculas m ON c.id_curso = m.id_curso
        LEFT JOIN asignaciones_aulas aa ON c.id_curso = aa.id_curso AND aa.estado = 'activa'
        LEFT JOIN docentes d ON aa.id_docente = d.id_docente
        LEFT JOIN aulas a ON aa.id_aula = a.id_aula
        WHERE (
          (DATE(c.fecha_inicio) BETWEEN ? AND ?) OR
          (DATE(c.fecha_fin) BETWEEN ? AND ?) OR
          (DATE(c.fecha_inicio) <= ? AND DATE(c.fecha_fin) >= ?)
        )
      `;

      const params = [fechaInicio, fechaFin, fechaInicio, fechaFin, fechaInicio, fechaFin];

      if (estado && estado !== 'todos') {
        if (estado === 'activo') {
          query += ` AND c.estado IN ('activo', 'cancelado') `;
        } else {
          query += ` AND c.estado = ? `;
          params.push(estado);
        }
      }

      if (horario && horario !== 'todos') {
        query += ` AND c.horario = ? `;
        params.push(horario);
      }

      query += `
        GROUP BY c.id_curso, c.codigo_curso, c.nombre, c.horario, c.capacidad_maxima,
        c.cupos_disponibles, c.fecha_inicio, c.fecha_fin, c.estado,
        tc.nombre, tc.duracion_meses, tc.precio_base, tc.modalidad_pago
      `;

      if (ocupacion && ocupacion !== 'todos') {
        if (ocupacion === 'lleno') {
          query += ` HAVING porcentaje_ocupacion >= 80`;
        } else if (ocupacion === 'medio') {
          query += ` HAVING porcentaje_ocupacion >= 40 AND porcentaje_ocupacion < 80`;
        } else if (ocupacion === 'bajo') {
          query += ` HAVING porcentaje_ocupacion < 40`;
        }
      }

      query += ` ORDER BY total_estudiantes DESC, porcentaje_ocupacion DESC`;

      const [rows] = await pool.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error en getReporteCursos:', error);
      throw error;
    }
  },

  /**
   * ESTADÍSTICAS DE CURSOS
   */
  async getEstadisticasCursos({ fechaInicio, fechaFin, estado, horario, ocupacion }) {
    try {
      let query = `
        SELECT
          COUNT(DISTINCT c.id_curso) as total_cursos,
          COUNT(DISTINCT CASE WHEN c.estado IN ('activo', 'cancelado') THEN c.id_curso END) as cursos_activos,
          COUNT(DISTINCT CASE WHEN c.estado = 'finalizado' THEN c.id_curso END) as cursos_finalizados,
          AVG(c.capacidad_maxima) as promedio_capacidad,
          AVG(c.cupos_disponibles) as promedio_cupos_disponibles,
          SUM(c.capacidad_maxima - c.cupos_disponibles) as total_estudiantes_inscritos
        FROM cursos c
        WHERE 1=1
      `;

      const params = [];

      if (fechaInicio && fechaFin) {
        query += ` AND DATE(c.fecha_inicio) BETWEEN ? AND ?`;
        params.push(fechaInicio, fechaFin);
      }

      if (estado && estado !== 'todos') {
        if (estado === 'activo') {
          query += ` AND c.estado IN ('activo', 'cancelado') `;
        } else {
          query += ` AND c.estado = ? `;
          params.push(estado);
        }
      }

      if (horario && horario !== 'todos') {
        query += ` AND c.horario = ? `;
        params.push(horario);
      }

      if (ocupacion && ocupacion !== 'todos') {
        query += ` AND (SELECT ROUND((COUNT(*) / c.capacidad_maxima) * 100, 2) FROM estudiante_curso ec WHERE ec.id_curso = c.id_curso) `;
        if (ocupacion === 'lleno') query += ` >= 80`;
        else if (ocupacion === 'medio') query += ` BETWEEN 40 AND 79.99`;
        else if (ocupacion === 'bajo') query += ` < 40`;
      }

      const [rows] = await pool.query(query, params);
      return rows[0];
    } catch (error) {
      console.error('Error en getEstadisticasCursos:', error);
      throw error;
    }
  },

  /**
   * OBTENER LISTA DE CURSOS PARA FILTROS
   */
  async getCursosParaFiltro() {
    try {
      const query = `
        SELECT
          c.id_curso,
          c.codigo_curso,
          c.nombre,
          c.horario,
          c.fecha_inicio,
          c.fecha_fin,
          tc.nombre as tipo_curso
        FROM cursos c
        INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
        WHERE c.estado IN('activo', 'planificado', 'cancelado')
        ORDER BY c.fecha_inicio DESC, c.nombre
      `;

      const [rows] = await pool.query(query);
      return rows;
    } catch (error) {
      console.error('Error en getCursosParaFiltro:', error);
      throw error;
    }
  },

  /**
   * Obtener rango de fechas dinámico basado en los datos reales
   * Retorna la fecha del primer y último curso creado
   */
  async getRangoFechasDinamico() {
    try {
      const query = `
        SELECT 
          DATE_FORMAT(MIN(fecha_inicio), '%Y-%m-%d') as fecha_minima,
          DATE_FORMAT(MAX(fecha_fin), '%Y-%m-%d') as fecha_maxima
        FROM cursos
        WHERE fecha_inicio IS NOT NULL
      `;

      const [rows] = await pool.query(query);

      if (rows.length > 0 && rows[0].fecha_minima && rows[0].fecha_maxima) {
        return {
          fechaInicio: rows[0].fecha_minima,
          fechaFin: rows[0].fecha_maxima
        };
      }

      return {
        fechaInicio: '2020-01-01',
        fechaFin: '2050-12-31'
      };
    } catch (error) {
      console.error('Error en getRangoFechasDinamico:', error);
      throw error;
    }
  }
};

module.exports = ReportesModel;
