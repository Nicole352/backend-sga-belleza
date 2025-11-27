const { pool } = require('../config/database');

const ReportesModel = {
  /**
   * REPORTE DE ESTUDIANTES
   * Obtiene estudiantes matriculados en un período con filtros
   */
  async getReporteEstudiantes({ fechaInicio, fechaFin, estado, idCurso, horario }) {
    try {
      // Subconsulta para calcular promedio dinámico si nota_final es null
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
          COALESCE(ec.nota_final, notas.promedio_calculado, 0) as nota_final,
          ec.fecha_graduacion,
          c.codigo_curso,
          c.nombre as nombre_curso,
          c.horario as horario_curso,
          tc.nombre as tipo_curso,
          tc.duracion_meses,
          m.codigo_matricula,
          m.monto_matricula,
          m.fecha_matricula,
          u.estado as estado_usuario
        FROM usuarios u
        INNER JOIN estudiante_curso ec ON u.id_usuario = ec.id_estudiante
        INNER JOIN cursos c ON ec.id_curso = c.id_curso
        INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
        INNER JOIN matriculas m ON m.id_estudiante = u.id_usuario AND m.id_curso = c.id_curso
        LEFT JOIN (
            SELECT 
                et.id_estudiante, 
                mc.id_curso, 
                AVG(ct.nota) as promedio_calculado
            FROM calificaciones_tareas ct
            JOIN entregas_tareas et ON ct.id_entrega = et.id_entrega
            JOIN tareas_modulo tm ON et.id_tarea = tm.id_tarea
            JOIN modulos_curso mc ON tm.id_modulo = mc.id_modulo
            GROUP BY et.id_estudiante, mc.id_curso
        ) as notas ON notas.id_estudiante = u.id_usuario AND notas.id_curso = c.id_curso
        WHERE 1=1
      `;

      const params = [];

      // Filtro por fecha de inscripción
      if (fechaInicio && fechaFin) {
        query += ` AND DATE(ec.fecha_inscripcion) BETWEEN ? AND ?`;
        params.push(fechaInicio, fechaFin);
      }

      // Filtro por estado académico y de usuario
      if (estado && estado !== 'todos') {
        if (estado === 'inactivo') {
          // Usuarios desactivados o retirados del curso
          query += ` AND(u.estado = 'inactivo' OR ec.estado IN('inactivo', 'retirado'))`;
        } else if (estado === 'graduado') {
          // Graduados o con nota mayor a 7 (usando promedio calculado)
          query += ` AND(ec.estado = 'graduado' OR COALESCE(ec.nota_final, notas.promedio_calculado, 0) >= 7)`;
        } else if (estado === 'activo') {
          // Activos en sistema y curso
          query += ` AND(u.estado = 'activo' AND ec.estado IN('activo', 'inscrito'))`;
        } else {
          query += ` AND ec.estado = ? `;
          params.push(estado);
        }
      }

      // Filtro por curso específico
      if (idCurso) {
        query += ` AND c.id_curso = ? `;
        params.push(idCurso);
      }

      // Filtro por horario del curso
      if (horario && horario !== 'todos') {
        query += ` AND c.horario = ? `;
        params.push(horario);
      }

      query += ` ORDER BY ec.fecha_inscripcion DESC`;

      const [rows] = await pool.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error en getReporteEstudiantes:', error);
      throw error;
    }
  },

  /**
   * ESTADÍSTICAS DE ESTUDIANTES
   */
  async getEstadisticasEstudiantes({ fechaInicio, fechaFin }) {
    try {
      const query = `
      SELECT
      COUNT(DISTINCT ec.id_estudiante) as total_estudiantes,
        COUNT(DISTINCT CASE WHEN u.estado = 'activo' AND ec.estado IN('activo', 'inscrito') THEN ec.id_estudiante END) as activos,
        COUNT(DISTINCT CASE WHEN ec.estado = 'aprobado' OR COALESCE(ec.nota_final, notas.promedio_calculado, 0) >= 7 THEN ec.id_estudiante END) as aprobados,
        COUNT(DISTINCT CASE WHEN ec.estado = 'reprobado' AND COALESCE(ec.nota_final, notas.promedio_calculado, 0) < 7 THEN ec.id_estudiante END) as reprobados,
        COUNT(DISTINCT CASE WHEN u.estado = 'inactivo' OR ec.estado IN('retirado', 'inactivo') THEN ec.id_estudiante END) as retirados,
        COUNT(DISTINCT CASE WHEN ec.estado = 'graduado' OR COALESCE(ec.nota_final, notas.promedio_calculado, 0) >= 7 THEN ec.id_estudiante END) as graduados,
        AVG(COALESCE(ec.nota_final, notas.promedio_calculado, 0)) as promedio_notas
        FROM estudiante_curso ec
        INNER JOIN usuarios u ON ec.id_estudiante = u.id_usuario
        LEFT JOIN(
          SELECT 
                et.id_estudiante,
          mc.id_curso,
          AVG(ct.nota) as promedio_calculado
            FROM calificaciones_tareas ct
            JOIN entregas_tareas et ON ct.id_entrega = et.id_entrega
            JOIN tareas_modulo tm ON et.id_tarea = tm.id_tarea
            JOIN modulos_curso mc ON tm.id_modulo = mc.id_modulo
            GROUP BY et.id_estudiante, mc.id_curso
        ) as notas ON notas.id_estudiante = ec.id_estudiante AND notas.id_curso = ec.id_curso
        WHERE DATE(ec.fecha_inscripcion) BETWEEN ? AND ?
        `;

      const [rows] = await pool.query(query, [fechaInicio, fechaFin]);
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
        c.codigo_curso,
        c.nombre as nombre_curso,
        c.horario,
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

      // Filtro por fecha - usar fecha_pago si existe, sino fecha_vencimiento
      if (fechaInicio && fechaFin) {
        query += ` AND DATE(COALESCE(pm.fecha_pago, pm.fecha_vencimiento)) BETWEEN ? AND ?`;
        params.push(fechaInicio, fechaFin);
      }

      // Filtro por curso específico
      if (idCurso) {
        query += ` AND c.id_curso = ? `;
        params.push(idCurso);
      }

      // Filtro por estado del curso
      if (estadoCurso && estadoCurso !== 'todos') {
        query += ` AND c.estado = ? `;
        params.push(estadoCurso);
      }

      // Filtro por horario del curso
      if (horario && horario !== 'todos') {
        query += ` AND c.horario = ? `;
        params.push(horario);
      }

      // Filtro por tipo de pago (primer mes = cuota 1)
      if (tipoPago && tipoPago !== 'todos') {
        if (tipoPago === 'primer_mes') {
          query += ` AND pm.numero_cuota = 1`;
        } else if (tipoPago === 'mensualidad') {
          query += ` AND pm.numero_cuota > 1 AND tc.modalidad_pago = 'mensual'`;
        } else if (tipoPago === 'clase') {
          query += ` AND tc.modalidad_pago = 'clases'`;
        }
      }

      // Filtro por estado de pago
      if (estadoPago && estadoPago !== 'todos') {
        query += ` AND pm.estado = ? `;
        params.push(estadoPago);
      }

      // Filtro por método de pago
      if (metodoPago && metodoPago !== 'todos') {
        query += ` AND pm.metodo_pago = ? `;
        params.push(metodoPago);
      }

      query += ` ORDER BY pm.fecha_pago DESC`;

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
  async getEstadisticasFinancieras({ fechaInicio, fechaFin }) {
    try {
      const query = `
SELECT
COUNT(*) as total_pagos,
  COUNT(CASE WHEN estado = 'pagado' THEN 1 END) as pagos_realizados,
  COUNT(CASE WHEN estado = 'verificado' THEN 1 END) as pagos_verificados,
  COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pagos_pendientes,
  COUNT(CASE WHEN estado = 'vencido' THEN 1 END) as pagos_vencidos,
  SUM(CASE WHEN estado IN('pagado', 'verificado') THEN monto ELSE 0 END) as ingresos_totales,
  SUM(CASE WHEN estado = 'pendiente' THEN monto ELSE 0 END) as ingresos_pendientes,
  AVG(CASE WHEN estado IN('pagado', 'verificado') THEN monto END) as promedio_pago,
  COUNT(DISTINCT CASE WHEN numero_cuota = 1 THEN id_matricula END) as matriculas_pagadas
        FROM pagos_mensuales
        WHERE DATE(COALESCE(fecha_pago, fecha_vencimiento)) BETWEEN ? AND ?
    `;

      const [rows] = await pool.query(query, [fechaInicio, fechaFin]);
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
        WHERE DATE(c.fecha_inicio) BETWEEN ? AND ?
  `;

      const params = [fechaInicio, fechaFin];

      // Filtro por estado del curso
      if (estado && estado !== 'todos') {
        query += ` AND c.estado = ? `;
        params.push(estado);
      }

      // Filtro por horario
      if (horario && horario !== 'todos') {
        query += ` AND c.horario = ? `;
        params.push(horario);
      }

      query += `
        GROUP BY c.id_curso, c.codigo_curso, c.nombre, c.horario, c.capacidad_maxima,
  c.cupos_disponibles, c.fecha_inicio, c.fecha_fin, c.estado,
  tc.nombre, tc.duracion_meses, tc.precio_base, tc.modalidad_pago
    `;

      // Filtro por ocupación (se aplica después del GROUP BY)
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
  async getEstadisticasCursos({ fechaInicio, fechaFin }) {
    try {
      const query = `
SELECT
COUNT(DISTINCT c.id_curso) as total_cursos,
  COUNT(DISTINCT CASE WHEN c.estado = 'activo' THEN c.id_curso END) as cursos_activos,
  COUNT(DISTINCT CASE WHEN c.estado = 'finalizado' THEN c.id_curso END) as cursos_finalizados,
  AVG(c.capacidad_maxima) as promedio_capacidad,
  AVG(c.cupos_disponibles) as promedio_cupos_disponibles,
  SUM(c.capacidad_maxima - c.cupos_disponibles) as total_estudiantes_inscritos
        FROM cursos c
        WHERE DATE(c.fecha_inicio) BETWEEN ? AND ?
  `;

      const [rows] = await pool.query(query, [fechaInicio, fechaFin]);
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
        WHERE c.estado IN('activo', 'planificado')
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

      // Si no hay cursos, retornar rango por defecto
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
