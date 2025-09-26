const { pool } = require('../config/database');

class DocentesModel {
  // Obtener todos los docentes con paginación y filtros
  static async getAll(filters = {}) {
    const { page = 1, limit = 10, search = '', estado = '' } = filters;
    
    const offset = (page - 1) * limit;
    
    // Consulta MUY simple primero - sin LIMIT
    const docentesQuery = `
      SELECT 
        id_docente,
        identificacion,
        nombres,
        apellidos,
        fecha_nacimiento,
        titulo_profesional,
        experiencia_anos,
        estado,
        fecha_creacion
      FROM docentes
      ORDER BY apellidos ASC, nombres ASC
    `;
    
    const [allDocentes] = await pool.execute(docentesQuery);
    
    // Aplicar paginación manualmente
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const docentes = allDocentes.slice(startIndex, endIndex);
    
    // Total es el length del array completo
    const total = allDocentes.length;
    
    return {
      docentes,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    };
  }

  // Obtener docente por ID
  static async getById(id) {
    const [docentes] = await pool.execute(
      'SELECT * FROM docentes WHERE id_docente = ?',
      [id]
    );
    
    return docentes.length > 0 ? docentes[0] : null;
  }

  // Obtener docente por identificación
  static async getByIdentificacion(identificacion) {
    const [docentes] = await pool.execute(
      'SELECT * FROM docentes WHERE identificacion = ?',
      [identificacion]
    );
    
    return docentes.length > 0 ? docentes[0] : null;
  }

  // Crear nuevo docente
  static async create(docenteData) {
    const {
      identificacion,
      nombres,
      apellidos,
      fecha_nacimiento,
      titulo_profesional,
      experiencia_anos = 0
    } = docenteData;

    const [result] = await pool.execute(`
      INSERT INTO docentes (
        identificacion, 
        nombres, 
        apellidos, 
        fecha_nacimiento,
        titulo_profesional,
        experiencia_anos
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      identificacion.trim(),
      nombres.trim(),
      apellidos.trim(),
      fecha_nacimiento || null,
      titulo_profesional.trim(),
      parseInt(experiencia_anos) || 0
    ]);

    return result.insertId;
  }

  // Actualizar docente
  static async update(id, docenteData) {
    const {
      identificacion,
      nombres,
      apellidos,
      fecha_nacimiento,
      titulo_profesional,
      experiencia_anos
    } = docenteData;

    const [result] = await pool.execute(`
      UPDATE docentes 
      SET identificacion = ?, 
          nombres = ?, 
          apellidos = ?, 
          fecha_nacimiento = ?,
          titulo_profesional = ?,
          experiencia_anos = ?
      WHERE id_docente = ?
    `, [
      identificacion.trim(),
      nombres.trim(),
      apellidos.trim(),
      fecha_nacimiento || null,
      titulo_profesional.trim(),
      parseInt(experiencia_anos) || 0,
      id
    ]);

    return result.affectedRows > 0;
  }

  // Cambiar estado del docente (soft delete)
  static async changeStatus(id, estado) {
    const [result] = await pool.execute(
      'UPDATE docentes SET estado = ? WHERE id_docente = ?',
      [estado, id]
    );

    return result.affectedRows > 0;
  }

  // Obtener estadísticas de docentes
  static async getStats() {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_docentes,
        SUM(CASE WHEN u.estado = 'activo' THEN 1 ELSE 0 END) as docentes_activos,
        SUM(CASE WHEN u.estado = 'inactivo' THEN 1 ELSE 0 END) as docentes_inactivos,
        AVG(d.experiencia_anos) as promedio_experiencia
      FROM docentes d
      INNER JOIN usuarios u ON u.cedula = d.identificacion
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'docente'
    `);
    
    return stats[0];
  }

  // Obtener docente con datos de usuario
  static async getWithUserData(identificacion) {
    const [usuarios] = await pool.execute(
      'SELECT telefono, genero, direccion, email, username, password_temporal, estado FROM usuarios WHERE cedula = ? LIMIT 1',
      [identificacion]
    );
    
    return usuarios.length > 0 ? usuarios[0] : null;
  }

  // Verificar si existe docente con identificación
  static async existsByIdentificacion(identificacion, excludeId = null) {
    let query = 'SELECT COUNT(*) as count FROM docentes WHERE identificacion = ?';
    let params = [identificacion];
    
    if (excludeId) {
      query += ' AND id_docente != ?';
      params.push(excludeId);
    }
    
    const [result] = await pool.execute(query, params);
    return result[0].count > 0;
  }
}

module.exports = DocentesModel;
