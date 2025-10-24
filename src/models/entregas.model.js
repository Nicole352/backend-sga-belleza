const { pool } = require('../config/database');

class EntregasModel {
  // Obtener todas las entregas de una tarea
  static async getAllByTarea(id_tarea) {
    const [entregas] = await pool.execute(`
      SELECT 
        e.*,
        u.nombre as estudiante_nombre,
        u.apellido as estudiante_apellido,
        u.cedula as estudiante_identificacion,
        u.email as estudiante_email,
        c.nota,
        c.comentario_docente,
        c.resultado,
        c.fecha_calificacion
      FROM entregas_tareas e
      INNER JOIN usuarios u ON e.id_estudiante = u.id_usuario
      LEFT JOIN calificaciones_tareas c ON e.id_entrega = c.id_entrega
      WHERE e.id_tarea = ?
      ORDER BY u.apellido ASC, u.nombre ASC
    `, [id_tarea]);
    
    return entregas;
  }

  // Obtener entrega por ID
  static async getById(id_entrega) {
    const [entregas] = await pool.execute(`
      SELECT 
        e.*,
        u.nombre as estudiante_nombre,
        u.apellido as estudiante_apellido,
        u.cedula as estudiante_cedula,
        u.email as estudiante_email,
        t.titulo as tarea_titulo,
        t.nota_maxima,
        t.nota_minima_aprobacion,
        m.nombre as modulo_nombre,
        c.nombre as curso_nombre,
        cal.nota,
        cal.comentario_docente,
        cal.resultado,
        cal.fecha_calificacion,
        cal.calificado_por,
        d.nombres as docente_nombres,
        d.apellidos as docente_apellidos
      FROM entregas_tareas e
      INNER JOIN usuarios u ON e.id_estudiante = u.id_usuario
      INNER JOIN tareas_modulo t ON e.id_tarea = t.id_tarea
      INNER JOIN modulos_curso m ON t.id_modulo = m.id_modulo
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      LEFT JOIN calificaciones_tareas cal ON e.id_entrega = cal.id_entrega
      LEFT JOIN docentes d ON cal.calificado_por = d.id_docente
      WHERE e.id_entrega = ?
    `, [id_entrega]);
    
    return entregas.length > 0 ? entregas[0] : null;
  }

  // Crear nueva entrega
  static async create(entregaData, archivoData = null) {
    const {
      id_tarea,
      id_estudiante,
      comentario_estudiante
    } = entregaData;

    const [result] = await pool.execute(`
      INSERT INTO entregas_tareas (
        id_tarea, id_estudiante, 
        archivo_entregado, archivo_mime, archivo_size_kb, archivo_nombre_original,
        comentario_estudiante, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'entregado')
    `, [
      id_tarea,
      id_estudiante,
      archivoData ? archivoData.buffer : null,
      archivoData ? archivoData.mime : null,
      archivoData ? archivoData.sizeKb : null,
      archivoData ? archivoData.nombreOriginal : null,
      comentario_estudiante ? comentario_estudiante.trim() : null
    ]);

    return result.insertId;
  }

  // Actualizar entrega (re-entrega)
  static async update(id_entrega, entregaData, archivoData = null) {
    const { comentario_estudiante } = entregaData;

    let query = 'UPDATE entregas_tareas SET comentario_estudiante = ?, fecha_entrega = NOW()';
    let params = [comentario_estudiante ? comentario_estudiante.trim() : null];

    if (archivoData) {
      query += ', archivo_entregado = ?, archivo_mime = ?, archivo_size_kb = ?, archivo_nombre_original = ?';
      params.push(
        archivoData.buffer,
        archivoData.mime,
        archivoData.sizeKb,
        archivoData.nombreOriginal
      );
    }

    query += ' WHERE id_entrega = ?';
    params.push(id_entrega);

    const [result] = await pool.execute(query, params);
    return result.affectedRows > 0;
  }

  // Eliminar entrega
  static async delete(id_entrega) {
    const [result] = await pool.execute(
      'DELETE FROM entregas_tareas WHERE id_entrega = ?',
      [id_entrega]
    );
    return result.affectedRows > 0;
  }

  // Obtener archivo de entrega
  static async getArchivo(id_entrega) {
    const [entregas] = await pool.execute(`
      SELECT 
        archivo_entregado,
        archivo_mime,
        archivo_nombre_original
      FROM entregas_tareas
      WHERE id_entrega = ?
    `, [id_entrega]);
    
    if (entregas.length === 0 || !entregas[0].archivo_entregado) {
      return null;
    }
    
    return {
      buffer: entregas[0].archivo_entregado,
      mime: entregas[0].archivo_mime || 'application/octet-stream',
      filename: entregas[0].archivo_nombre_original || `entrega-${id_entrega}`
    };
  }

  // Verificar si el estudiante ya entregó
  static async existsEntrega(id_tarea, id_estudiante) {
    const [result] = await pool.execute(
      'SELECT COUNT(*) as count FROM entregas_tareas WHERE id_tarea = ? AND id_estudiante = ?',
      [id_tarea, id_estudiante]
    );
    return result[0].count > 0;
  }

  // Obtener entrega de un estudiante en una tarea
  static async getByTareaEstudiante(id_tarea, id_estudiante) {
    const [entregas] = await pool.execute(`
      SELECT 
        e.*,
        t.titulo as tarea_titulo,
        t.nota_maxima,
        t.fecha_limite,
        c.nota,
        c.comentario_docente,
        c.resultado,
        c.fecha_calificacion
      FROM entregas_tareas e
      INNER JOIN tareas_modulo t ON e.id_tarea = t.id_tarea
      LEFT JOIN calificaciones_tareas c ON e.id_entrega = c.id_entrega
      WHERE e.id_tarea = ? AND e.id_estudiante = ?
    `, [id_tarea, id_estudiante]);
    
    return entregas.length > 0 ? entregas[0] : null;
  }

  // Verificar si la entrega pertenece al estudiante
  static async belongsToEstudiante(id_entrega, id_estudiante) {
    const [result] = await pool.execute(
      'SELECT COUNT(*) as count FROM entregas_tareas WHERE id_entrega = ? AND id_estudiante = ?',
      [id_entrega, id_estudiante]
    );
    return result[0].count > 0;
  }
}

module.exports = EntregasModel;
