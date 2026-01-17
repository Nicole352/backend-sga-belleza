const { pool } = require('../config/database');

class AulasModel {
  // Obtener todas las aulas con filtros y paginación
  static async getAll(filters = {}) {
    const { page = 1, limit = 10, search = '', estado = '' } = filters;

    // Sanitizar valores como enteros para usar inline
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 10));
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const offset = (safePage - 1) * safeLimit;

    // Construir condiciones WHERE
    let whereConditions = [];
    let queryParams = [];

    if (search) {
      whereConditions.push('(codigo_aula LIKE ? OR nombre LIKE ? OR ubicacion LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (estado && estado !== 'todos') {
      whereConditions.push('estado = ?');
      queryParams.push(estado);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Consulta para obtener aulas (LIMIT/OFFSET inline para evitar ER_WRONG_ARGUMENTS)
    const aulasQuery = `
      SELECT 
        id_aula,
        codigo_aula,
        nombre,
        ubicacion,
        descripcion,
        estado,
        fecha_creacion,
        fecha_actualizacion
      FROM aulas 
      ${whereClause}
      ORDER BY codigo_aula ASC
      LIMIT ${safeLimit} OFFSET ${offset}
    `;

    // Consulta para contar total
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM aulas 
      ${whereClause}
    `;

    // Ejecutar consultas
    const [aulas] = await pool.execute(aulasQuery, queryParams);
    const [countResult] = await pool.execute(countQuery, queryParams);
    const total = countResult[0].total;

    return {
      aulas,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit)
    };
  }

  // Obtener aula por ID
  static async getById(id) {
    const [aulas] = await pool.execute(
      'SELECT * FROM aulas WHERE id_aula = ?',
      [id]
    );

    return aulas.length > 0 ? aulas[0] : null;
  }

  // Crear nueva aula
  static async create(aulaData) {
    const { codigo_aula, nombre, ubicacion, descripcion, estado = 'activa' } = aulaData;

    const [result] = await pool.execute(
      `INSERT INTO aulas (codigo_aula, nombre, ubicacion, descripcion, estado) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        codigo_aula.trim(),
        nombre.trim(),
        ubicacion ? ubicacion.trim() : null,
        descripcion ? descripcion.trim() : null,
        estado
      ]
    );

    return result.insertId;
  }

  // Actualizar aula
  static async update(id, aulaData) {
    const { nombre, ubicacion, descripcion, estado } = aulaData;

    const [result] = await pool.execute(
      `UPDATE aulas 
       SET nombre = ?, ubicacion = ?, descripcion = ?, estado = ?
       WHERE id_aula = ?`,
      [
        nombre.trim(),
        ubicacion ? ubicacion.trim() : null,
        descripcion ? descripcion.trim() : null,
        estado,
        id
      ]
    );

    return result.affectedRows > 0;
  }

  // Eliminar aula
  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM aulas WHERE id_aula = ?', [id]);
    return result.affectedRows > 0;
  }

  // Verificar si existe aula con el mismo nombre
  static async existsByNombre(nombre, excludeId = null) {
    let query = 'SELECT COUNT(*) as count FROM aulas WHERE nombre = ?';
    let params = [nombre.trim()];

    if (excludeId) {
      query += ' AND id_aula != ?';
      params.push(excludeId);
    }

    const [result] = await pool.execute(query, params);
    return result[0].count > 0;
  }

  // Verificar si existe aula con el mismo código
  static async existsByCodigo(codigo_aula, excludeId = null) {
    let query = 'SELECT COUNT(*) as count FROM aulas WHERE codigo_aula = ?';
    let params = [codigo_aula.trim()];

    if (excludeId) {
      query += ' AND id_aula != ?';
      params.push(excludeId);
    }

    const [result] = await pool.execute(query, params);
    return result[0].count > 0;
  }

  // Obtener aulas por estado
  static async getByEstado(estado, limit = 100) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));

    let sql = `SELECT id_aula, nombre, codigo_aula, ubicacion, estado FROM aulas WHERE 1=1`;
    const params = [];

    if (estado) {
      sql += ' AND estado = ?';
      params.push(estado);
    }

    // Evitar placeholder en LIMIT por compatibilidad
    sql += ` ORDER BY nombre ASC LIMIT ${safeLimit}`;

    const [rows] = await pool.execute(sql, params);
    return rows;
  }

  // Verificar si el aula está siendo usada
  static async isInUse(id) {
    // TODO: Implementar verificación si el aula está siendo usada en cursos o asignaciones
    // Por ahora retorna false para permitir eliminación
    return false;
  }

  // Obtener estadísticas de aulas
  static async getStats() {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_aulas,
        SUM(CASE WHEN estado = 'activa' THEN 1 ELSE 0 END) as aulas_activas,
        SUM(CASE WHEN estado = 'inactiva' THEN 1 ELSE 0 END) as aulas_inactivas,
        SUM(CASE WHEN estado = 'mantenimiento' THEN 1 ELSE 0 END) as aulas_mantenimiento,
        SUM(CASE WHEN estado = 'reservada' THEN 1 ELSE 0 END) as aulas_reservadas
      FROM aulas
    `);

    return stats[0];
  }

  // Validar estado de aula
  static isValidEstado(estado) {
    const estadosValidos = ['activa', 'inactiva', 'mantenimiento', 'reservada'];
    return estadosValidos.includes(estado);
  }
}

module.exports = AulasModel;
