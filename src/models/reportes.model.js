const { pool } = require('../config/database');

const ReportesModel = {
  /**
   * REPORTE DE ESTUDIANTES
   * Obtiene estudiantes matriculados en un período con filtros
   */
  async getReporteEstudiantes({ fechaInicio, fechaFin, estado, idCurso }) {
    try {
      let query = `
        SELECT 
          u.id_usuario,
          u.cedula,
          u.nombre,
          u.apellido,
          u.email,
          u.telefono,
          u.genero,
          u.fecha_registro,
          ec.fecha_inscripcion,
          ec.estado as estado_academico,
          ec.nota_final,
          ec.fecha_graduacion,
          c.codigo_curso,
          c.nombre as nombre_curso,
          c.horario as horario_curso,
          tc.nombre as tipo_curso,
          tc.duracion_meses,
          m.codigo_matricula,
          m.monto_matricula,
          m.fecha_matricula
        FROM usuarios u
        INNER JOIN estudiante_curso ec ON u.id_usuario = ec.id_estudiante
        INNER JOIN cursos c ON ec.id_curso = c.id_curso
        INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
        INNER JOIN matriculas m ON m.id_estudiante = u.id_usuario AND m.id_curso = c.id_curso
        WHERE u.id_rol = (SELECT id_rol FROM roles WHERE nombre_rol = 'estudiante')
      `;

      const params = [];

      // Filtro por fecha de inscripción
      if (fechaInicio && fechaFin) {
        query += ` AND DATE(ec.fecha_inscripcion) BETWEEN ? AND ?`;
        params.push(fechaInicio, fechaFin);
      }

      // Filtro por estado académico
      if (estado && estado !== 'todos') {
        query += ` AND ec.estado = ?`;
        params.push(estado);
      }

      // Filtro por curso específico
      if (idCurso) {
        query += ` AND c.id_curso = ?`;
        params.push(idCurso);
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
          COUNT(DISTINCT CASE WHEN ec.estado = 'activo' THEN ec.id_estudiante END) as activos,
          COUNT(DISTINCT CASE WHEN ec.estado = 'aprobado' THEN ec.id_estudiante END) as aprobados,
          COUNT(DISTINCT CASE WHEN ec.estado = 'reprobado' THEN ec.id_estudiante END) as reprobados,
          COUNT(DISTINCT CASE WHEN ec.estado = 'retirado' THEN ec.id_estudiante END) as retirados,
          COUNT(DISTINCT CASE WHEN ec.estado = 'graduado' THEN ec.id_estudiante END) as graduados,
          AVG(ec.nota_final) as promedio_notas
        FROM estudiante_curso ec
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
  async getReporteFinanciero({ fechaInicio, fechaFin, tipoPago, estadoPago }) {
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
        INNER JOIN estudiante_curso ec ON ec.id_estudiante = u.id_usuario AND ec.id_curso = c.id_curso
        LEFT JOIN usuarios verificador ON pm.verificado_por = verificador.id_usuario
        WHERE u.id_rol = (SELECT id_rol FROM roles WHERE nombre_rol = 'estudiante')
      `;

      const params = [];

      // Filtro por fecha - usar fecha_pago para pagados/verificados, fecha_vencimiento para pendientes
      if (fechaInicio && fechaFin) {
        query += ` AND (
          (pm.estado IN ('pagado', 'verificado') AND DATE(pm.fecha_pago) BETWEEN ? AND ?)
          OR (pm.estado = 'pendiente' AND DATE(pm.fecha_vencimiento) BETWEEN ? AND ?)
        )`;
        params.push(fechaInicio, fechaFin, fechaInicio, fechaFin);
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
        query += ` AND pm.estado = ?`;
        params.push(estadoPago);
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
          SUM(CASE WHEN estado IN ('pagado', 'verificado') THEN monto ELSE 0 END) as ingresos_totales,
          SUM(CASE WHEN estado = 'pendiente' THEN monto ELSE 0 END) as ingresos_pendientes,
          AVG(CASE WHEN estado IN ('pagado', 'verificado') THEN monto END) as promedio_pago,
          COUNT(DISTINCT CASE WHEN numero_cuota = 1 THEN id_matricula END) as matriculas_pagadas
        FROM pagos_mensuales
        WHERE DATE(fecha_pago) BETWEEN ? AND ?
           OR (estado = 'pendiente' AND DATE(fecha_vencimiento) BETWEEN ? AND ?)
      `;

      const [rows] = await pool.query(query, [fechaInicio, fechaFin, fechaInicio, fechaFin]);
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
  async getReporteCursos({ fechaInicio, fechaFin }) {
    try {
      const query = `
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
        GROUP BY c.id_curso, c.codigo_curso, c.nombre, c.horario, c.capacidad_maxima, 
                 c.cupos_disponibles, c.fecha_inicio, c.fecha_fin, c.estado,
                 tc.nombre, tc.duracion_meses, tc.precio_base, tc.modalidad_pago
        ORDER BY total_estudiantes DESC, porcentaje_ocupacion DESC
      `;

      const [rows] = await pool.query(query, [fechaInicio, fechaFin]);
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
        WHERE c.estado IN ('activo', 'planificado')
        ORDER BY c.fecha_inicio DESC, c.nombre
      `;

      const [rows] = await pool.query(query);
      return rows;
    } catch (error) {
      console.error('Error en getCursosParaFiltro:', error);
      throw error;
    }
  }
};

module.exports = ReportesModel;
