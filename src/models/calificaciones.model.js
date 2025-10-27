const { pool } = require('../config/database');

class CalificacionesModel {
  // Crear o actualizar calificación
  static async createOrUpdate(calificacionData) {
    const {
      id_entrega,
      nota,
      comentario_docente,
      calificado_por
    } = calificacionData;

    // Determinar resultado automáticamente
    const [tarea] = await pool.execute(`
      SELECT t.nota_minima_aprobacion
      FROM entregas_tareas e
      INNER JOIN tareas_modulo t ON e.id_tarea = t.id_tarea
      WHERE e.id_entrega = ?
    `, [id_entrega]);

    if (tarea.length === 0) {
      throw new Error('Entrega no encontrada');
    }

    const nota_minima = parseFloat(tarea[0].nota_minima_aprobacion);
    const resultado = parseFloat(nota) >= nota_minima ? 'aprobado' : 'reprobado';

    // Verificar si ya existe una calificación
    const [existing] = await pool.execute(
      'SELECT id_calificacion FROM calificaciones_tareas WHERE id_entrega = ?',
      [id_entrega]
    );

    if (existing.length > 0) {
      // Actualizar calificación existente
      const [result] = await pool.execute(`
        UPDATE calificaciones_tareas 
        SET nota = ?, 
            comentario_docente = ?, 
            resultado = ?,
            fecha_calificacion = NOW(),
            calificado_por = ?
        WHERE id_entrega = ?
      `, [nota, comentario_docente ? comentario_docente.trim() : null, resultado, calificado_por, id_entrega]);

      // Actualizar estado de la entrega
      await pool.execute(
        'UPDATE entregas_tareas SET estado = ? WHERE id_entrega = ?',
        ['calificado', id_entrega]
      );

      return existing[0].id_calificacion;
    } else {
      // Crear nueva calificación
      const [result] = await pool.execute(`
        INSERT INTO calificaciones_tareas (
          id_entrega, nota, comentario_docente, resultado, calificado_por
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        id_entrega,
        nota,
        comentario_docente ? comentario_docente.trim() : null,
        resultado,
        calificado_por
      ]);

      // Actualizar estado de la entrega
      await pool.execute(
        'UPDATE entregas_tareas SET estado = ? WHERE id_entrega = ?',
        ['calificado', id_entrega]
      );

      return result.insertId;
    }
  }

  // Obtener calificación por ID de entrega
  static async getByEntrega(id_entrega) {
    const [calificaciones] = await pool.execute(`
      SELECT 
        c.*,
        d.nombres as docente_nombres,
        d.apellidos as docente_apellidos
      FROM calificaciones_tareas c
      INNER JOIN docentes d ON c.calificado_por = d.id_docente
      WHERE c.id_entrega = ?
    `, [id_entrega]);
    
    return calificaciones.length > 0 ? calificaciones[0] : null;
  }

  // Obtener calificaciones de un estudiante en un curso
  static async getByEstudianteCurso(id_estudiante, id_curso) {
    const [calificaciones] = await pool.execute(`
      SELECT 
        c.*,
        t.titulo as tarea_titulo,
        t.nota_maxima,
        t.ponderacion,
        m.id_modulo,
        m.nombre as modulo_nombre,
        m.id_modulo as modulo_orden,
        m.promedios_publicados,
        e.fecha_entrega,
        d.nombres as docente_nombres,
        d.apellidos as docente_apellidos
      FROM calificaciones_tareas c
      INNER JOIN entregas_tareas e ON c.id_entrega = e.id_entrega
      INNER JOIN tareas_modulo t ON e.id_tarea = t.id_tarea
      INNER JOIN modulos_curso m ON t.id_modulo = m.id_modulo
      INNER JOIN docentes d ON c.calificado_por = d.id_docente
      WHERE e.id_estudiante = ? AND m.id_curso = ?
      ORDER BY m.id_modulo ASC, t.fecha_limite ASC
    `, [id_estudiante, id_curso]);
    
    return calificaciones;
  }

  // Obtener promedio de calificaciones de un estudiante en un módulo
  static async getPromedioModulo(id_estudiante, id_modulo) {
    const [result] = await pool.execute(`
      SELECT 
        AVG(c.nota) as promedio,
        COUNT(c.id_calificacion) as total_calificaciones,
        SUM(CASE WHEN c.resultado = 'aprobado' THEN 1 ELSE 0 END) as aprobadas,
        SUM(CASE WHEN c.resultado = 'reprobado' THEN 1 ELSE 0 END) as reprobadas
      FROM calificaciones_tareas c
      INNER JOIN entregas_tareas e ON c.id_entrega = e.id_entrega
      INNER JOIN tareas_modulo t ON e.id_tarea = t.id_tarea
      WHERE e.id_estudiante = ? AND t.id_modulo = ?
    `, [id_estudiante, id_modulo]);
    
    return result[0];
  }

  // Obtener promedio general de un estudiante en un curso
  static async getPromedioCurso(id_estudiante, id_curso) {
    const [result] = await pool.execute(`
      SELECT 
        AVG(c.nota) as promedio,
        COUNT(c.id_calificacion) as total_calificaciones,
        SUM(CASE WHEN c.resultado = 'aprobado' THEN 1 ELSE 0 END) as aprobadas,
        SUM(CASE WHEN c.resultado = 'reprobado' THEN 1 ELSE 0 END) as reprobadas
      FROM calificaciones_tareas c
      INNER JOIN entregas_tareas e ON c.id_entrega = e.id_entrega
      INNER JOIN tareas_modulo t ON e.id_tarea = t.id_tarea
      INNER JOIN modulos_curso m ON t.id_modulo = m.id_modulo
      WHERE e.id_estudiante = ? AND m.id_curso = ?
    `, [id_estudiante, id_curso]);
    
    return result[0];
  }

  // Eliminar calificación
  static async delete(id_calificacion) {
    // Primero obtener el id_entrega
    const [calificacion] = await pool.execute(
      'SELECT id_entrega FROM calificaciones_tareas WHERE id_calificacion = ?',
      [id_calificacion]
    );

    if (calificacion.length === 0) {
      return false;
    }

    const id_entrega = calificacion[0].id_entrega;

    // Eliminar calificación
    const [result] = await pool.execute(
      'DELETE FROM calificaciones_tareas WHERE id_calificacion = ?',
      [id_calificacion]
    );

    // Actualizar estado de la entrega a 'revisado'
    if (result.affectedRows > 0) {
      await pool.execute(
        'UPDATE entregas_tareas SET estado = ? WHERE id_entrega = ?',
        ['revisado', id_entrega]
      );
    }

    return result.affectedRows > 0;
  }
}

module.exports = CalificacionesModel;
