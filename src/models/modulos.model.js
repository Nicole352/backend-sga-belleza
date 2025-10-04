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
      ORDER BY m.numero_orden ASC
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
      numero_orden,
      fecha_inicio,
      fecha_fin,
      estado = 'activo'
    } = moduloData;

    const [result] = await pool.execute(`
      INSERT INTO modulos_curso (
        id_curso, id_docente, nombre, descripcion, 
        numero_orden, fecha_inicio, fecha_fin, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id_curso,
      id_docente,
      nombre.trim(),
      descripcion ? descripcion.trim() : null,
      numero_orden,
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
      numero_orden,
      fecha_inicio,
      fecha_fin,
      estado
    } = moduloData;

    const [result] = await pool.execute(`
      UPDATE modulos_curso 
      SET nombre = ?, 
          descripcion = ?, 
          numero_orden = ?,
          fecha_inicio = ?,
          fecha_fin = ?,
          estado = ?
      WHERE id_modulo = ?
    `, [
      nombre.trim(),
      descripcion ? descripcion.trim() : null,
      numero_orden,
      fecha_inicio || null,
      fecha_fin || null,
      estado,
      id_modulo
    ]);

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

  // Obtener el siguiente número de orden disponible
  static async getNextOrden(id_curso) {
    const [result] = await pool.execute(
      'SELECT COALESCE(MAX(numero_orden), 0) + 1 as next_orden FROM modulos_curso WHERE id_curso = ?',
      [id_curso]
    );
    return result[0].next_orden;
  }

  // Verificar si existe un módulo con el mismo orden
  static async existsOrden(id_curso, numero_orden, excludeId = null) {
    let query = 'SELECT COUNT(*) as count FROM modulos_curso WHERE id_curso = ? AND numero_orden = ?';
    let params = [id_curso, numero_orden];
    
    if (excludeId) {
      query += ' AND id_modulo != ?';
      params.push(excludeId);
    }
    
    const [result] = await pool.execute(query, params);
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
}

module.exports = ModulosModel;
