const { pool } = require("../config/database");

class ModulosModel {
  // Obtener todos los módulos de un curso
  static async getAllByCurso(id_curso) {
    const [modulos] = await pool.execute(
      `
      SELECT
        m.*,
        d.nombres as docente_nombres,
        d.apellidos as docente_apellidos,
        (SELECT COUNT(*) FROM tareas_modulo WHERE id_modulo = m.id_modulo AND estado = 'activo') as total_tareas,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', c.id_categoria,
              'nombre', c.nombre,
              'ponderacion', c.ponderacion
            )
          )
          FROM categorias_evaluacion c
          WHERE c.id_modulo = m.id_modulo
        ) as categorias
      FROM modulos_curso m
      INNER JOIN docentes d ON m.id_docente = d.id_docente
      WHERE m.id_curso = ?
      ORDER BY m.id_modulo ASC
    `,
      [id_curso],
    );

    return modulos;
  }

  // Obtener módulo por ID
  static async getById(id_modulo) {
    const [modulos] = await pool.execute(
      `
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
    `,
      [id_modulo],
    );

    if (modulos.length === 0) return null;

    const modulo = modulos[0];

    // Obtener categorías del módulo
    const [categorias] = await pool.execute(
      `SELECT * FROM categorias_evaluacion WHERE id_modulo = ? ORDER BY id_categoria ASC`,
      [id_modulo]
    );

    modulo.categorias = categorias;

    return modulo;
  }

  // Crear nuevo módulo
  // Crear nuevo módulo con categorías
  static async create(moduloData) {
    const {
      id_curso,
      id_docente,
      nombre,
      descripcion,
      fecha_inicio,
      fecha_fin,
      estado = "activo",
      categorias = []
    } = moduloData;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Validar si ya existe un módulo con el mismo nombre en el curso
      const [existing] = await connection.execute(
        "SELECT id_modulo FROM modulos_curso WHERE id_curso = ? AND nombre = ? AND estado != 'inactivo'",
        [id_curso, nombre.trim()]
      );

      if (existing.length > 0) {
        throw new Error('Ya existe un módulo activo con este nombre en el curso');
      }

      const [result] = await connection.execute(
        `
        INSERT INTO modulos_curso (
          id_curso, id_docente, nombre, descripcion,
          fecha_inicio, fecha_fin, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
          id_curso,
          id_docente,
          nombre.trim(),
          descripcion ? descripcion.trim() : null,
          fecha_inicio || null,
          fecha_fin || null,
          estado,
        ],
      );

      const id_modulo = result.insertId;

      // Insertar categorías si existen
      if (categorias && categorias.length > 0) {
        for (const cat of categorias) {
          await connection.execute(
            `INSERT INTO categorias_evaluacion (id_modulo, nombre, ponderacion) VALUES (?, ?, ?)`,
            [id_modulo, cat.nombre, cat.ponderacion]
          );
        }
      }

      await connection.commit();
      return id_modulo;

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Actualizar módulo
  static async update(id_modulo, moduloData) {
    const { nombre, descripcion, fecha_inicio, fecha_fin, estado, categorias } = moduloData;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Construir dinámicamente la consulta de actualización del módulo
      const fields = [];
      const values = [];

      if (nombre !== undefined) {
        fields.push("nombre = ?");
        values.push(nombre.trim());
      }

      if (descripcion !== undefined) {
        fields.push("descripcion = ?");
        values.push(descripcion ? descripcion.trim() : null);
      }

      if (fecha_inicio !== undefined) {
        fields.push("fecha_inicio = ?");
        values.push(fecha_inicio || null);
      }

      if (fecha_fin !== undefined) {
        fields.push("fecha_fin = ?");
        values.push(fecha_fin || null);
      }

      if (estado !== undefined) {
        fields.push("estado = ?");
        values.push(estado);
      }

      // Actualizar módulo si hay campos para actualizar
      if (fields.length > 0) {
        values.push(id_modulo);
        const query = `
          UPDATE modulos_curso
          SET ${fields.join(", ")}
          WHERE id_modulo = ?
        `;
        await connection.execute(query, values);
      }

      // Actualizar categorías si se proporcionaron
      if (categorias !== undefined && Array.isArray(categorias)) {
        // Verificar si alguna categoría existente tiene tareas asignadas
        const [existingCategories] = await connection.execute(
          `SELECT id_categoria FROM categorias_evaluacion WHERE id_modulo = ?`,
          [id_modulo]
        );

        // Verificar si hay tareas asignadas a las categorías existentes
        if (existingCategories.length > 0) {
          const categoryIds = existingCategories.map(c => c.id_categoria);
          const [tasksWithCategories] = await connection.execute(
            `SELECT COUNT(*) as count FROM tareas_modulo 
             WHERE id_categoria IN (${categoryIds.map(() => '?').join(',')})`,
            categoryIds
          );

          if (tasksWithCategories[0].count > 0) {
            throw new Error('No se pueden modificar las categorías porque ya tienen tareas asignadas');
          }
        }

        // Eliminar categorías antiguas (solo si no tienen tareas)
        await connection.execute(
          `DELETE FROM categorias_evaluacion WHERE id_modulo = ?`,
          [id_modulo]
        );

        // Insertar nuevas categorías
        if (categorias.length > 0) {
          for (const cat of categorias) {
            await connection.execute(
              `INSERT INTO categorias_evaluacion (id_modulo, nombre, ponderacion) VALUES (?, ?, ?)`,
              [id_modulo, cat.nombre, cat.ponderacion]
            );
          }
        }
      }

      await connection.commit();
      return true;

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Eliminar módulo
  static async delete(id_modulo) {
    const [result] = await pool.execute(
      "DELETE FROM modulos_curso WHERE id_modulo = ?",
      [id_modulo],
    );
    return result.affectedRows > 0;
  }

  // Verificar si el módulo pertenece al docente
  static async belongsToDocente(id_modulo, id_docente) {
    const [result] = await pool.execute(
      "SELECT COUNT(*) as count FROM modulos_curso WHERE id_modulo = ? AND id_docente = ?",
      [id_modulo, id_docente],
    );
    return result[0].count > 0;
  }

  // Obtener estadísticas del módulo
  static async getStats(id_modulo) {
    const [stats] = await pool.execute(
      `
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
    `,
      [id_modulo],
    );

    return stats[0];
  }

  // Calcular promedio ponderado de un estudiante en un módulo
  static async getPromedioPonderado(id_modulo, id_estudiante) {
    const [result] = await pool.execute(
      `
      SELECT
        SUM((cal.nota / t.nota_maxima) * t.ponderacion) as promedio_ponderado,
        SUM(t.ponderacion) as suma_ponderaciones,
        COUNT(DISTINCT t.id_tarea) as total_tareas,
        COUNT(DISTINCT cal.id_calificacion) as tareas_calificadas
      FROM tareas_modulo t
      LEFT JOIN entregas_tareas e ON t.id_tarea = e.id_tarea AND e.id_estudiante = ?
      LEFT JOIN calificaciones_tareas cal ON e.id_entrega = cal.id_entrega
      WHERE t.id_modulo = ? AND t.estado = 'activo'
    `,
      [id_estudiante, id_modulo],
    );

    return result[0];
  }

  // Obtener promedios ponderados de todos los estudiantes de un módulo
  static async getPromediosPonderadosPorModulo(id_modulo) {
    const [result] = await pool.execute(
      `
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
    `,
      [id_modulo],
    );

    return result;
  }

  // Publicar promedios de un módulo
  static async publicarPromedios(id_modulo) {
    const [result] = await pool.execute(
      "UPDATE modulos_curso SET promedios_publicados = TRUE WHERE id_modulo = ?",
      [id_modulo],
    );
    return result.affectedRows > 0;
  }

  // Ocultar promedios de un módulo
  static async ocultarPromedios(id_modulo) {
    const [result] = await pool.execute(
      "UPDATE modulos_curso SET promedios_publicados = FALSE WHERE id_modulo = ?",
      [id_modulo],
    );
    return result.affectedRows > 0;
  }

  // Verificar si los promedios están publicados
  static async estanPromediosPublicados(id_modulo) {
    const [result] = await pool.execute(
      "SELECT promedios_publicados FROM modulos_curso WHERE id_modulo = ?",
      [id_modulo],
    );
    return result.length > 0 ? result[0].promedios_publicados : false;
  }
}

module.exports = ModulosModel;
