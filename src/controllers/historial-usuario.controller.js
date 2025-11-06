const { pool } = require('../config/database');

// Obtener historial detallado de un estudiante
exports.getHistorialEstudiante = async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const { tipo } = req.query; // 'administrativas' o 'academicas'

    let historial = [];

    if (tipo === 'administrativas' || !tipo) {
      // HISTORIAL ADMINISTRATIVO

      // 1. Cambios de contraseña
      const [cambiosPassword] = await pool.execute(`
        SELECT 
          'password' as tipo_accion,
          'Cambió su contraseña' as accion,
          fecha_operacion as fecha,
          ip_address as detalles
        FROM auditoria
        WHERE id_usuario = ? 
        AND descripcion LIKE '%contraseña%'
        ORDER BY fecha_operacion DESC
      `, [id_usuario]);

      // 2. Cambios de foto de perfil
      const [cambiosFoto] = await pool.execute(`
        SELECT 
          'foto' as tipo_accion,
          CASE 
            WHEN operacion = 'INSERT' THEN 'Subió foto de perfil'
            WHEN operacion = 'UPDATE' THEN 'Actualizó foto de perfil'
            WHEN operacion = 'DELETE' THEN 'Eliminó foto de perfil'
          END as accion,
          fecha_operacion as fecha,
          detalles
        FROM auditoria
        WHERE id_usuario = ? 
        AND (descripcion LIKE '%foto%' OR tabla_afectada = 'usuarios')
        AND operacion IN ('INSERT', 'UPDATE', 'DELETE')
        ORDER BY fecha_operacion DESC
      `, [id_usuario]);

      // 3. Historial de pagos detallado
      const [pagos] = await pool.execute(`
        SELECT 
          'pago' as tipo_accion,
          CONCAT('Pago de $', pm.monto, ' - ', c.nombre) as accion,
          pm.fecha_pago as fecha,
          JSON_OBJECT(
            'curso', c.nombre,
            'monto', pm.monto,
            'metodo_pago', pm.metodo_pago,
            'estado', pm.estado,
            'numero_cuota', pm.numero_cuota,
            'fecha_verificacion', pm.fecha_verificacion
          ) as detalles
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        INNER JOIN cursos c ON m.id_curso = c.id_curso
        WHERE m.id_estudiante = ?
        ORDER BY pm.fecha_pago DESC
      `, [id_usuario]);

      historial = [...cambiosPassword, ...cambiosFoto, ...pagos];
    }

    if (tipo === 'academicas' || !tipo) {
      // HISTORIAL ACADÉMICO

      // 1. Tareas subidas
      const [tareasSubidas] = await pool.execute(`
        SELECT 
          'tarea_subida' as tipo_accion,
          CONCAT('Subió tarea: ', t.titulo) as accion,
          e.fecha_entrega as fecha,
          JSON_OBJECT(
            'tarea', t.titulo,
            'curso', c.nombre,
            'modulo', mo.nombre,
            'archivo', e.archivo_entrega,
            'estado', e.estado_entrega
          ) as detalles
        FROM entregas e
        INNER JOIN tareas t ON e.id_tarea = t.id_tarea
        INNER JOIN modulos mo ON t.id_modulo = mo.id_modulo
        INNER JOIN cursos c ON mo.id_curso = c.id_curso
        WHERE e.id_estudiante = ?
        ORDER BY e.fecha_entrega DESC
      `, [id_usuario]);

      // 2. Calificaciones recibidas
      const [calificaciones] = await pool.execute(`
        SELECT 
          'calificacion' as tipo_accion,
          CONCAT('Calificación recibida: ', c.valor, '/10 - ', t.titulo) as accion,
          c.fecha_calificacion as fecha,
          JSON_OBJECT(
            'tarea', t.titulo,
            'nota', c.valor,
            'comentario', c.comentario,
            'curso', cu.nombre,
            'docente', CONCAT(d.nombre, ' ', d.apellido)
          ) as detalles
        FROM calificaciones c
        INNER JOIN entregas e ON c.id_entrega = e.id_entrega
        INNER JOIN tareas t ON e.id_tarea = t.id_tarea
        INNER JOIN modulos mo ON t.id_modulo = mo.id_modulo
        INNER JOIN cursos cu ON mo.id_curso = cu.id_curso
        INNER JOIN usuarios d ON c.id_docente = d.id_usuario
        WHERE e.id_estudiante = ?
        ORDER BY c.fecha_calificacion DESC
      `, [id_usuario]);

      // 3. Matrículas/Cursos inscritos
      const [matriculas] = await pool.execute(`
        SELECT 
          'matricula' as tipo_accion,
          CONCAT('Matriculado en: ', c.nombre) as accion,
          m.fecha_matricula as fecha,
          JSON_OBJECT(
            'curso', c.nombre,
            'estado', m.estado,
            'fecha_inicio', c.fecha_inicio,
            'fecha_fin', c.fecha_fin
          ) as detalles
        FROM matriculas m
        INNER JOIN cursos c ON m.id_curso = c.id_curso
        WHERE m.id_estudiante = ?
        ORDER BY m.fecha_matricula DESC
      `, [id_usuario]);

      historial = tipo === 'academicas' 
        ? [...tareasSubidas, ...calificaciones, ...matriculas]
        : [...historial, ...tareasSubidas, ...calificaciones, ...matriculas];
    }

    // Ordenar todo por fecha
    historial.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json(historial);
  } catch (error) {
    console.error('Error obteniendo historial del estudiante:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener historial detallado de un docente
exports.getHistorialDocente = async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const { tipo } = req.query; // 'administrativas' o 'academicas'

    let historial = [];

    if (tipo === 'administrativas' || !tipo) {
      // HISTORIAL ADMINISTRATIVO

      // 1. Cambios de contraseña
      const [cambiosPassword] = await pool.execute(`
        SELECT 
          'password' as tipo_accion,
          'Cambió su contraseña' as accion,
          fecha_operacion as fecha,
          ip_address as detalles
        FROM auditoria
        WHERE id_usuario = ? 
        AND descripcion LIKE '%contraseña%'
        ORDER BY fecha_operacion DESC
      `, [id_usuario]);

      // 2. Cambios de foto de perfil
      const [cambiosFoto] = await pool.execute(`
        SELECT 
          'foto' as tipo_accion,
          CASE 
            WHEN operacion = 'INSERT' THEN 'Subió foto de perfil'
            WHEN operacion = 'UPDATE' THEN 'Actualizó foto de perfil'
            WHEN operacion = 'DELETE' THEN 'Eliminó foto de perfil'
          END as accion,
          fecha_operacion as fecha,
          detalles
        FROM auditoria
        WHERE id_usuario = ? 
        AND (descripcion LIKE '%foto%' OR tabla_afectada = 'usuarios')
        AND operacion IN ('INSERT', 'UPDATE', 'DELETE')
        ORDER BY fecha_operacion DESC
      `, [id_usuario]);

      historial = [...cambiosPassword, ...cambiosFoto];
    }

    if (tipo === 'academicas' || !tipo) {
      // HISTORIAL ACADÉMICO

      // 1. Módulos creados
      const [modulosCreados] = await pool.execute(`
        SELECT 
          'modulo_creado' as tipo_accion,
          CONCAT('Creó módulo: ', mo.nombre) as accion,
          mo.fecha_creacion as fecha,
          JSON_OBJECT(
            'modulo', mo.nombre,
            'curso', c.nombre,
            'descripcion', mo.descripcion
          ) as detalles
        FROM modulos mo
        INNER JOIN cursos c ON mo.id_curso = c.id_curso
        WHERE mo.id_docente = ?
        ORDER BY mo.fecha_creacion DESC
      `, [id_usuario]);

      // 2. Tareas creadas
      const [tareasCreadas] = await pool.execute(`
        SELECT 
          'tarea_creada' as tipo_accion,
          CONCAT('Creó tarea: ', t.titulo) as accion,
          t.fecha_creacion as fecha,
          JSON_OBJECT(
            'tarea', t.titulo,
            'modulo', mo.nombre,
            'curso', c.nombre,
            'fecha_limite', t.fecha_limite,
            'puntos', t.puntos_maximo
          ) as detalles
        FROM tareas t
        INNER JOIN modulos mo ON t.id_modulo = mo.id_modulo
        INNER JOIN cursos c ON mo.id_curso = c.id_curso
        WHERE mo.id_docente = ?
        ORDER BY t.fecha_creacion DESC
      `, [id_usuario]);

      // 3. Entregas calificadas
      const [entregasCalificadas] = await pool.execute(`
        SELECT 
          'entrega_calificada' as tipo_accion,
          CONCAT('Calificó a ', u.nombre, ' ', u.apellido, ' - ', t.titulo) as accion,
          ca.fecha_calificacion as fecha,
          JSON_OBJECT(
            'estudiante', CONCAT(u.nombre, ' ', u.apellido),
            'tarea', t.titulo,
            'nota', ca.valor,
            'comentario', ca.comentario,
            'curso', c.nombre
          ) as detalles
        FROM calificaciones ca
        INNER JOIN entregas e ON ca.id_entrega = e.id_entrega
        INNER JOIN usuarios u ON e.id_estudiante = u.id_usuario
        INNER JOIN tareas t ON e.id_tarea = t.id_tarea
        INNER JOIN modulos mo ON t.id_modulo = mo.id_modulo
        INNER JOIN cursos c ON mo.id_curso = c.id_curso
        WHERE ca.id_docente = ?
        ORDER BY ca.fecha_calificacion DESC
      `, [id_usuario]);

      historial = tipo === 'academicas'
        ? [...modulosCreados, ...tareasCreadas, ...entregasCalificadas]
        : [...historial, ...modulosCreados, ...tareasCreadas, ...entregasCalificadas];
    }

    // Ordenar todo por fecha
    historial.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.json(historial);
  } catch (error) {
    console.error('Error obteniendo historial del docente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
