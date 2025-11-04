const { pool } = require('../config/database');

/**
 * INICIALIZACIÓN AUTOMÁTICA DE TIPOS DE REPORTES
 * Se ejecuta automáticamente al iniciar el servidor
 * Si la tabla tipos_reportes está vacía, inserta los 3 tipos por defecto
 */
async function inicializarTiposReportes() {
  try {
    console.log('🔍 Verificando tipos de reportes...');

    // Verificar si ya existen tipos de reportes
    const [tipos] = await pool.query('SELECT COUNT(*) as total FROM tipos_reportes');
    
    if (tipos[0].total > 0) {
      console.log(`✅ Tipos de reportes ya inicializados (${tipos[0].total} tipos encontrados)`);
      return;
    }

    console.log('⚙️ Inicializando tipos de reportes por defecto...');

    // Insertar los 3 tipos de reportes
    const queryInsert = `
      INSERT INTO tipos_reportes (nombre, descripcion, formato_salida, plantilla_query, estado) VALUES
      (
        'Reporte de Estudiantes',
        'Lista completa de estudiantes matriculados con información académica, filtros por estado, curso y período',
        'ambos',
        'SELECT u.id_usuario, u.cedula, u.nombre, u.apellido, u.email, u.telefono, u.genero, u.fecha_registro, ec.fecha_inscripcion, ec.estado as estado_academico, ec.nota_final, ec.fecha_graduacion, c.codigo_curso, c.nombre as nombre_curso, c.horario as horario_curso, tc.nombre as tipo_curso, tc.duracion_meses, m.codigo_matricula, m.monto_matricula, m.fecha_matricula FROM usuarios u INNER JOIN estudiante_curso ec ON u.id_usuario = ec.id_estudiante INNER JOIN cursos c ON ec.id_curso = c.id_curso INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso INNER JOIN matriculas m ON m.id_estudiante = u.id_usuario AND m.id_curso = c.id_curso WHERE u.id_rol = (SELECT id_rol FROM roles WHERE nombre_rol = "estudiante") ORDER BY ec.fecha_inscripcion DESC',
        'activo'
      ),
      (
        'Reporte Financiero',
        'Reporte completo de pagos mensuales con información de estudiantes, cursos y verificadores. Incluye filtros por tipo de pago, estado y período',
        'ambos',
        'SELECT pm.id_pago, pm.numero_cuota, pm.monto, pm.fecha_vencimiento, pm.fecha_pago, pm.metodo_pago, pm.numero_comprobante, pm.banco_comprobante, pm.fecha_transferencia, pm.recibido_por, pm.estado as estado_pago, pm.observaciones, u.cedula as cedula_estudiante, u.nombre as nombre_estudiante, u.apellido as apellido_estudiante, u.email as email_estudiante, c.codigo_curso, c.nombre as nombre_curso, tc.nombre as tipo_curso, tc.modalidad_pago, m.codigo_matricula, m.monto_matricula, verificador.nombre as verificado_por_nombre, verificador.apellido as verificado_por_apellido, pm.fecha_verificacion FROM pagos_mensuales pm INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario INNER JOIN cursos c ON m.id_curso = c.id_curso INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso LEFT JOIN usuarios verificador ON pm.verificado_por = verificador.id_usuario ORDER BY pm.fecha_pago DESC',
        'activo'
      ),
      (
        'Reporte de Cursos',
        'Información detallada de cursos con estadísticas de ocupación, estudiantes activos, graduados e ingresos. Incluye datos de docentes y aulas asignadas',
        'ambos',
        'SELECT c.id_curso, c.codigo_curso, c.nombre as nombre_curso, c.horario, c.capacidad_maxima, c.cupos_disponibles, c.fecha_inicio, c.fecha_fin, c.estado as estado_curso, tc.nombre as tipo_curso, tc.duracion_meses, tc.precio_base, tc.modalidad_pago, COUNT(DISTINCT ec.id_estudiante) as total_estudiantes, COUNT(DISTINCT CASE WHEN ec.estado = "activo" THEN ec.id_estudiante END) as estudiantes_activos, COUNT(DISTINCT CASE WHEN ec.estado = "graduado" THEN ec.id_estudiante END) as estudiantes_graduados, ROUND((COUNT(DISTINCT ec.id_estudiante) / c.capacidad_maxima) * 100, 2) as porcentaje_ocupacion, SUM(m.monto_matricula) as ingresos_matriculas, MAX(d.nombres) as docente_nombres, MAX(d.apellidos) as docente_apellidos, MAX(a.nombre) as aula_nombre, MAX(a.ubicacion) as aula_ubicacion, MAX(aa.hora_inicio) as hora_inicio, MAX(aa.hora_fin) as hora_fin, MAX(aa.dias) as dias FROM cursos c INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso LEFT JOIN estudiante_curso ec ON c.id_curso = ec.id_curso LEFT JOIN matriculas m ON c.id_curso = m.id_curso LEFT JOIN asignaciones_aulas aa ON c.id_curso = aa.id_curso AND aa.estado = "activa" LEFT JOIN docentes d ON aa.id_docente = d.id_docente LEFT JOIN aulas a ON aa.id_aula = a.id_aula GROUP BY c.id_curso, c.codigo_curso, c.nombre, c.horario, c.capacidad_maxima, c.cupos_disponibles, c.fecha_inicio, c.fecha_fin, c.estado, tc.nombre, tc.duracion_meses, tc.precio_base, tc.modalidad_pago ORDER BY total_estudiantes DESC, porcentaje_ocupacion DESC',
        'activo'
      )
    `;

    await pool.query(queryInsert);

    console.log('✅ Tipos de reportes inicializados correctamente:');
    console.log('   1. Reporte de Estudiantes');
    console.log('   2. Reporte Financiero');
    console.log('   3. Reporte de Cursos');

  } catch (error) {
    console.error('-Error al inicializar tipos de reportes:', error);
    console.error('   El sistema de reportes puede no funcionar correctamente.');
    // No lanzamos el error para que el servidor pueda iniciar de todas formas
  }
}

module.exports = inicializarTiposReportes;
