const { pool } = require('../config/database');

// Obtener pagos realizados por un estudiante
exports.getPagosEstudiante = async (req, res) => {
  try {
    const id_usuario = parseInt(req.params.id_usuario);
    const limite = parseInt(req.query.limite) || 10;

    console.log('🔍 Buscando pagos para estudiante:', id_usuario, 'límite:', limite);

    const [pagos] = await pool.query(`
      SELECT 
        pm.id_pago,
        pm.numero_cuota,
        pm.monto,
        pm.fecha_pago,
        pm.metodo_pago,
        pm.numero_comprobante,
        pm.banco_comprobante,
        pm.recibido_por,
        pm.estado,
        pm.observaciones,
        tc.nombre as curso_nombre,
        c.codigo_curso as curso_codigo
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN tipos_cursos tc ON m.id_tipo_curso = tc.id_tipo_curso
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      WHERE m.id_estudiante = ?
        AND pm.estado IN ('pagado', 'verificado')
      ORDER BY pm.fecha_pago DESC
      LIMIT ?
    `, [id_usuario, limite]);

    console.log('✅ Pagos encontrados:', pagos.length);

    res.json({
      success: true,
      pagos
    });
  } catch (error) {
    console.error('❌ Error al obtener pagos del estudiante:', error);
    console.error('❌ SQL Error:', error.sqlMessage || error.message);
    res.status(500).json({
      success: false,
      message: 'Error al obtener pagos del estudiante',
      error: error.message,
      sqlError: error.sqlMessage
    });
  }
};

// Obtener deberes subidos por un estudiante
exports.getDeberesEstudiante = async (req, res) => {
  try {
    const id_usuario = parseInt(req.params.id_usuario);
    const limite = parseInt(req.query.limite) || 10;

    console.log('🔍 Buscando deberes para estudiante:', id_usuario, 'límite:', limite);

    const [deberes] = await pool.query(`
      SELECT 
        et.id_entrega,
        et.fecha_entrega,
        ct.nota as calificacion,
        ct.comentario_docente,
        et.estado,
        et.archivo_nombre_original as archivo_nombre,
        et.archivo_size_kb,
        t.titulo as deber_titulo,
        t.descripcion as deber_descripcion,
        t.fecha_limite as deber_fecha_limite,
        tc.nombre as curso_nombre,
        c.codigo_curso as curso_codigo,
        CONCAT(d.nombres, ' ', d.apellidos) as docente_nombre
      FROM entregas_tareas et
      INNER JOIN tareas_modulo t ON et.id_tarea = t.id_tarea
      INNER JOIN modulos_curso mc ON t.id_modulo = mc.id_modulo
      INNER JOIN cursos c ON mc.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      LEFT JOIN calificaciones_tareas ct ON et.id_entrega = ct.id_entrega
      LEFT JOIN docentes d ON t.id_docente = d.id_docente
      WHERE et.id_estudiante = ?
      ORDER BY et.fecha_entrega DESC
      LIMIT ?
    `, [id_usuario, limite]);

    console.log('✅ Deberes encontrados:', deberes.length);

    res.json({
      success: true,
      deberes
    });
  } catch (error) {
    console.error('❌ Error al obtener deberes del estudiante:', error);
    console.error('❌ SQL Error:', error.sqlMessage || error.message);
    res.status(500).json({
      success: false,
      message: 'Error al obtener deberes del estudiante',
      error: error.message,
      sqlError: error.sqlMessage
    });
  }
};

// Obtener actividad combinada (pagos + deberes) de un estudiante
exports.getActividadEstudiante = async (req, res) => {
  try {
    const id_usuario = parseInt(req.params.id_usuario);
    const limite = parseInt(req.query.limite) || 20;

    // Obtener pagos
    const [pagos] = await pool.query(`
      SELECT 
        'pago' as tipo_actividad,
        pm.id_pago as id,
        pm.fecha_pago as fecha,
        pm.metodo_pago,
        pm.numero_comprobante,
        pm.banco_comprobante,
        pm.recibido_por,
        pm.monto,
        pm.numero_cuota,
        pm.estado,
        tc.nombre as curso_nombre,
        c.codigo_curso as curso_codigo
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN tipos_cursos tc ON m.id_tipo_curso = tc.id_tipo_curso
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      WHERE m.id_estudiante = ?
        AND pm.estado IN ('pagado', 'verificado')
        AND pm.fecha_pago IS NOT NULL
    `, [id_usuario]);

    // Obtener deberes
    const [deberes] = await pool.query(`
      SELECT 
        'deber' as tipo_actividad,
        et.id_entrega as id,
        et.fecha_entrega as fecha,
        ct.nota as calificacion,
        et.estado,
        et.archivo_nombre_original as archivo_nombre,
        t.titulo as deber_titulo,
        tc.nombre as curso_nombre,
        c.codigo_curso as curso_codigo
      FROM entregas_tareas et
      INNER JOIN tareas_modulo t ON et.id_tarea = t.id_tarea
      INNER JOIN modulos_curso mc ON t.id_modulo = mc.id_modulo
      INNER JOIN cursos c ON mc.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      LEFT JOIN calificaciones_tareas ct ON et.id_entrega = ct.id_entrega
      WHERE et.id_estudiante = ?
    `, [id_usuario]);

    // Combinar y ordenar por fecha
    const actividades = [...pagos, ...deberes]
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, limite);

    res.json({
      success: true,
      actividades,
      total: actividades.length,
      pagos: pagos.length,
      deberes: deberes.length
    });
  } catch (error) {
    console.error('Error al obtener actividad del estudiante:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener actividad del estudiante',
      error: error.message
    });
  }
};
