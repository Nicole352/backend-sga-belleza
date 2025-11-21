const { pool } = require('../config/database');

class DocentesModel {
  // Obtener todos los docentes con paginación y filtros
  static async getAll(filters = {}) {
    const { page = 1, limit = 10, search = '', estado = '' } = filters;

    const offset = (page - 1) * limit;

    // Consulta con JOIN a usuarios para obtener id_usuario, gmail y foto_perfil
    const docentesQuery = `
      SELECT 
        d.id_docente,
        d.identificacion,
        d.nombres,
        d.apellidos,
        d.fecha_nacimiento,
        d.titulo_profesional,
        d.experiencia_anos,
        d.estado,
        d.fecha_creacion,
        u.id_usuario,
        u.email as gmail,
        u.username,
        u.password_temporal,
        CASE 
          WHEN u.foto_perfil IS NOT NULL THEN CONCAT('data:image/jpeg;base64,', TO_BASE64(u.foto_perfil))
          ELSE NULL 
        END as foto_perfil
      FROM docentes d
      LEFT JOIN usuarios u ON u.cedula = d.identificacion AND u.id_rol = (SELECT id_rol FROM roles WHERE nombre_rol = 'docente')
      ORDER BY d.apellidos ASC, d.nombres ASC
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

  // Obtener cursos asignados al docente
  static async getMisCursos(id_docente) {
    const [cursos] = await pool.execute(`
      SELECT 
        c.id_curso,
        c.codigo_curso,
        c.nombre,
        c.fecha_inicio,
        c.fecha_fin,
        c.capacidad_maxima,
        c.estado,
        a.codigo_aula,
        a.nombre as aula_nombre,
        a.ubicacion as aula_ubicacion,
        aa.hora_inicio,
        aa.hora_fin,
        aa.dias,
        COUNT(DISTINCT m.id_matricula) as total_estudiantes
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      LEFT JOIN aulas a ON aa.id_aula = a.id_aula
      LEFT JOIN matriculas m ON c.id_curso = m.id_curso AND m.estado = 'activa'
      WHERE aa.id_docente = ? AND aa.estado = 'activa'
      GROUP BY c.id_curso, c.codigo_curso, c.nombre, c.fecha_inicio, c.fecha_fin, 
               c.capacidad_maxima, c.estado, a.codigo_aula, a.nombre, a.ubicacion,
               aa.hora_inicio, aa.hora_fin, aa.dias
      ORDER BY c.fecha_inicio DESC
    `, [id_docente]);

    return cursos;
  }

  // Obtener estudiantes de los cursos del docente
  static async getMisEstudiantes(id_docente) {
    const [estudiantes] = await pool.execute(`
      SELECT DISTINCT
        u.id_usuario,
        u.nombre,
        u.apellido,
        u.cedula,
        u.email,
        u.telefono,
        c.nombre as curso_nombre,
        c.codigo_curso,
        c.fecha_inicio as fecha_inicio_curso,
        c.fecha_fin as fecha_fin_curso,
        c.estado as estado_curso,
        m.fecha_matricula
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      INNER JOIN matriculas m ON c.id_curso = m.id_curso AND m.estado = 'activa'
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      WHERE aa.id_docente = ? AND aa.estado = 'activa'
      ORDER BY u.apellido ASC, u.nombre ASC
    `, [id_docente]);

    return estudiantes;
  }

  // Obtener horario semanal del docente (solo cursos activos)
  static async getMiHorario(id_docente) {
    const [horarios] = await pool.execute(`
      SELECT 
        aa.id_asignacion,
        c.nombre as curso_nombre,
        c.codigo_curso,
        a.nombre as aula_nombre,
        a.ubicacion as aula_ubicacion,
        aa.hora_inicio,
        aa.hora_fin,
        aa.dias
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      INNER JOIN aulas a ON aa.id_aula = a.id_aula
      WHERE aa.id_docente = ? 
        AND aa.estado = 'activa'
        AND c.estado NOT IN ('finalizado', 'cancelado')
        AND c.fecha_fin >= CURDATE()
      ORDER BY aa.hora_inicio ASC
    `, [id_docente]);

    return horarios;
  }

  // Verificar si el usuario es docente
  static async isDocente(id_usuario) {
    const [result] = await pool.execute(`
      SELECT COUNT(*) as count
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE u.id_usuario = ? AND r.nombre_rol = 'docente'
    `, [id_usuario]);

    return result[0].count > 0;
  }

  // Obtener ID de docente por ID de usuario
  static async getDocenteIdByUserId(id_usuario) {
    const [result] = await pool.execute(`
      SELECT d.id_docente
      FROM docentes d
      INNER JOIN usuarios u ON d.identificacion = u.cedula
      WHERE u.id_usuario = ?
    `, [id_usuario]);

    return result.length > 0 ? result[0].id_docente : null;
  }
}

module.exports = DocentesModel;
