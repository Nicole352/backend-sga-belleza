const { pool } = require('../config/database');

class ModulosModel {
  // Obtener todos los módulos de un curso
  static async getAllByCurso(id_curso) {
    const [modulos] = await pool.execute(`
      SELECT 
        m.*,
        d.nombres as docente_nombres,
        d.apellidos as docente_apellidos,
        (SELECT COUNT(*) FROM tareas_modulo WHERE id_modulo = m.id_modulo AND estado = 'activo') as total_tareas
      FROM modulos_curso m
      INNER JOIN docentes d ON m.id_docente = d.id_docente
      WHERE m.id_curso = ?
      ORDER BY m.id_modulo ASC
    `, [id_curso]);
    
    return modulos;
  }

  // Obtener módulo por ID
  static async getById(id_modulo) {
    const [modulos] = await pool.execute(`
      SELECT 
        m.*,
        c.nombre as curso_nombre,
        c.codigo_curso,
        d.nombres as docente_nombres,
        d.apellidos as docente_apellidos,
        (SELECT COUNT(*) FROM tareas_modulo WHERE id_modulo = m.id_modulo AND estado = 'activo') as total_tareas
      FROM modulos_curso m
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN docentes d ON m.id_docente = d.id_docente
      WHERE m.id_modulo = ?
    `, [id_modulo]);
    
    return modulos.length > 0 ? modulos[0] : null;
  }

  // Crear nuevo módulo
  static async create(moduloData) {
    const {
      id_curso,
      id_docente,
      nombre,
      descripcion,
      fecha_inicio,
      fecha_fin,
      estado = 'activo'
    } = moduloData;

    const [result] = await pool.execute(`
      INSERT INTO modulos_curso (
        id_curso, id_docente, nombre, descripcion, 
        fecha_inicio, fecha_fin, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      id_curso,
      id_docente,
      nombre.trim(),
      descripcion ? descripcion.trim() : null,
      fecha_inicio || null,
      fecha_fin || null,
      estado
    ]);

    return result.insertId;
  }

  // Actualizar módulo
  static async update(id_modulo, moduloData) {
    const {
      nombre,
      descripcion,
      fecha_inicio,
      fecha_fin,
      estado
    } = moduloData;

    // Construir dinámicamente la consulta de actualización
    const fields = [];
    const values = [];

    if (nombre !== undefined) {
      fields.push('nombre = ?');
      values.push(nombre.trim());
    }

    if (descripcion !== undefined) {
      fields.push('descripcion = ?');
      values.push(descripcion ? descripcion.trim() : null);
    }

    if (fecha_inicio !== undefined) {
      fields.push('fecha_inicio = ?');
      values.push(fecha_inicio || null);
    }

    if (fecha_fin !== undefined) {
      fields.push('fecha_fin = ?');
      values.push(fecha_fin || null);
    }

    if (estado !== undefined) {
      fields.push('estado = ?');
      values.push(estado);
    }

    // Si no hay campos para actualizar, retornar true (no hay cambios necesarios)
    if (fields.length === 0) {
      return true;
    }

    // Agregar el ID del módulo al final de los valores
    values.push(id_modulo);

    const query = `
      UPDATE modulos_curso 
      SET ${fields.join(', ')}
      WHERE id_modulo = ?
    `;

    const [result] = await pool.execute(query, values);

    return result.affectedRows > 0;
  }

  // Eliminar módulo
  static async delete(id_modulo) {
    const [result] = await pool.execute(
      'DELETE FROM modulos_curso WHERE id_modulo = ?',
      [id_modulo]
    );
    return result.affectedRows > 0;
  }

  // Verificar si el módulo pertenece al docente
  static async belongsToDocente(id_modulo, id_docente) {
    const [result] = await pool.execute(
      'SELECT COUNT(*) as count FROM modulos_curso WHERE id_modulo = ? AND id_docente = ?',
      [id_modulo, id_docente]
    );
    return result[0].count > 0;
  }

  // Obtener estadísticas del módulo
  static async getStats(id_modulo) {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(DISTINCT t.id_tarea) as total_tareas,
        COUNT(DISTINCT e.id_entrega) as total_entregas,
        COUNT(DISTINCT CASE WHEN c.resultado = 'aprobado' THEN c.id_calificacion END) as entregas_aprobadas,
        COUNT(DISTINCT CASE WHEN c.resultado = 'reprobado' THEN c.id_calificacion END) as entregas_reprobadas,
        COUNT(DISTINCT CASE WHEN e.estado = 'entregado' THEN e.id_entrega END) as entregas_pendientes
      FROM modulos_curso m
      LEFT JOIN tareas_modulo t ON m.id_modulo = t.id_modulo
      LEFT JOIN entregas_tareas e ON t.id_tarea = e.id_tarea
      LEFT JOIN calificaciones_tareas c ON e.id_entrega = c.id_entrega
      WHERE m.id_modulo = ?
    `, [id_modulo]);
    
    return stats[0];
  }

  // Calcular promedio ponderado de un estudiante en un módulo
  static async getPromedioPonderado(id_modulo, id_estudiante) {
    const [result] = await pool.execute(`
      SELECT 
        SUM((cal.nota / t.nota_maxima) * t.ponderacion) as promedio_ponderado,
        SUM(t.ponderacion) as suma_ponderaciones,
        COUNT(DISTINCT t.id_tarea) as total_tareas,
        COUNT(DISTINCT cal.id_calificacion) as tareas_calificadas
      FROM tareas_modulo t
      LEFT JOIN entregas_tareas e ON t.id_tarea = e.id_tarea AND e.id_estudiante = ?
      LEFT JOIN calificaciones_tareas cal ON e.id_entrega = cal.id_entrega
      WHERE t.id_modulo = ? AND t.estado = 'activo'
    `, [id_estudiante, id_modulo]);
    
    return result[0];
  }

  // Obtener promedios ponderados de todos los estudiantes de un módulo
  static async getPromediosPonderadosPorModulo(id_modulo) {
    const [result] = await pool.execute(`
      SELECT 
        u.id_usuario as id_estudiante,
        u.nombre,
        u.apellido,
        SUM((cal.nota / t.nota_maxima) * t.ponderacion) as promedio_ponderado,
        SUM(t.ponderacion) as suma_ponderaciones,
        COUNT(DISTINCT t.id_tarea) as total_tareas,
        COUNT(DISTINCT cal.id_calificacion) as tareas_calificadas
      FROM estudiante_curso ec
      INNER JOIN usuarios u ON ec.id_estudiante = u.id_usuario
      INNER JOIN modulos_curso m ON ec.id_curso = m.id_curso
      INNER JOIN tareas_modulo t ON m.id_modulo = t.id_modulo AND t.estado = 'activo'
      LEFT JOIN entregas_tareas e ON t.id_tarea = e.id_tarea AND e.id_estudiante = u.id_usuario
      LEFT JOIN calificaciones_tareas cal ON e.id_entrega = cal.id_entrega
      WHERE m.id_modulo = ?
      GROUP BY u.id_usuario, u.nombre, u.apellido
      ORDER BY u.apellido, u.nombre
    `, [id_modulo]);
    
    return result;
  }

  // Publicar promedios de un módulo
  static async publicarPromedios(id_modulo) {
    const [result] = await pool.execute(
      'UPDATE modulos_curso SET promedios_publicados = TRUE WHERE id_modulo = ?',
      [id_modulo]
    );
    return result.affectedRows > 0;
  }

  // Ocultar promedios de un módulo
  static async ocultarPromedios(id_modulo) {
    const [result] = await pool.execute(
      'UPDATE modulos_curso SET promedios_publicados = FALSE WHERE id_modulo = ?',
      [id_modulo]
    );
    return result.affectedRows > 0;
  }

  // Verificar si los promedios están publicados
  static async estanPromediosPublicados(id_modulo) {
    const [result] = await pool.execute(
      'SELECT promedios_publicados FROM modulos_curso WHERE id_modulo = ?',
      [id_modulo]
    );
    return result.length > 0 ? result[0].promedios_publicados : false;
  }
}

module.exports = ModulosModel;
