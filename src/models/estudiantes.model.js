const { pool } = require('../config/database');

class EstudiantesModel {
  // Obtener todos los estudiantes con paginación y filtros
  static async getAll(filters = {}) {
    const { page = 1, limit = 10, search = '' } = filters;
    const offset = (page - 1) * limit;
    
    let sql = `
      SELECT 
        u.id_usuario,
        u.cedula as identificacion,
        u.nombre,
        u.apellido,
        u.username,
        u.email,
        u.telefono,
        u.fecha_nacimiento,
        u.genero,
        u.direccion,
        u.estado,
        u.fecha_registro,
        u.fecha_ultima_conexion
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante'
    `;
    
    const params = [];
    
    if (search) {
      sql += ` AND (
        u.nombre LIKE ? OR 
        u.apellido LIKE ? OR 
        u.cedula LIKE ? OR 
        u.email LIKE ?
      )`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }
    
    sql += ` ORDER BY u.fecha_registro DESC LIMIT ${limit} OFFSET ${offset}`;
    
    // Consulta de datos
    const [estudiantes] = await pool.execute(sql, params);
    
    // Consulta de total
    let sqlCount = `
      SELECT COUNT(*) as total 
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante'
    `;
    
    const paramsCount = [];
    if (search) {
      sqlCount += ` AND (
        u.nombre LIKE ? OR 
        u.apellido LIKE ? OR 
        u.cedula LIKE ? OR 
        u.email LIKE ?
      )`;
      const searchParam = `%${search}%`;
      paramsCount.push(searchParam, searchParam, searchParam, searchParam);
    }
    
    const [[{ total }]] = await pool.execute(sqlCount, paramsCount);
    
    return {
      estudiantes,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    };
  }

  // Obtener estudiante por ID
  static async getById(id) {
    const [estudiantes] = await pool.execute(`
      SELECT 
        u.id_usuario,
        u.cedula as identificacion,
        u.nombre,
        u.apellido,
        u.username,
        u.email,
        u.telefono,
        u.fecha_nacimiento,
        u.genero,
        u.direccion,
        u.estado,
        u.fecha_registro,
        u.fecha_ultima_conexion
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante' AND u.id_usuario = ?
    `, [id]);
    
    return estudiantes.length > 0 ? estudiantes[0] : null;
  }

  // Obtener estudiante por cédula
  static async getByCedula(cedula) {
    const [estudiantes] = await pool.execute(`
      SELECT 
        u.id_usuario,
        u.cedula as identificacion,
        u.nombre,
        u.apellido,
        u.username,
        u.email,
        u.telefono,
        u.fecha_nacimiento,
        u.genero,
        u.direccion,
        u.estado,
        u.fecha_registro,
        u.fecha_ultima_conexion
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante' AND u.cedula = ?
    `, [cedula]);
    
    return estudiantes.length > 0 ? estudiantes[0] : null;
  }

  // Crear estudiante desde solicitud
  static async createFromSolicitud(solicitudData, userData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Crear usuario estudiante
      const [userResult] = await connection.execute(`
        INSERT INTO usuarios (
          cedula, nombre, apellido, fecha_nacimiento, telefono, email, username,
          direccion, genero, password, password_temporal, id_rol, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userData.cedula,
        userData.nombre,
        userData.apellido,
        userData.fecha_nacimiento,
        userData.telefono,
        userData.email,
        userData.username,
        userData.direccion,
        userData.genero,
        userData.hashedPassword,
        userData.passwordTemporal,
        userData.id_rol,
        'activo'
      ]);
      
      const id_estudiante = userResult.insertId;
      
      // Crear matrícula si hay curso disponible
      if (userData.id_curso) {
        const codigoMatricula = `MAT-${Date.now()}-${id_estudiante}`;
        
        await connection.execute(`
          INSERT INTO matriculas (
            codigo_matricula, id_solicitud, id_tipo_curso, id_estudiante, 
            id_curso, monto_matricula, email_generado, creado_por, estado
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activa')
        `, [
          codigoMatricula,
          solicitudData.id_solicitud,
          solicitudData.id_tipo_curso,
          id_estudiante,
          userData.id_curso,
          solicitudData.monto_matricula || 0,
          userData.email || `${userData.username}@estudiante.belleza.com`,
          userData.aprobado_por
        ]);
      }
      
      // Actualizar estado de la solicitud
      await connection.execute(`
        UPDATE solicitudes_matricula 
        SET estado = 'aprobado', 
            verificado_por = ?, 
            fecha_verificacion = NOW()
        WHERE id_solicitud = ?
      `, [userData.aprobado_por, solicitudData.id_solicitud]);
      
      await connection.commit();
      
      return {
        id_usuario: id_estudiante,
        identificacion: userData.cedula,
        nombre: userData.nombre,
        apellido: userData.apellido,
        email: userData.email,
        username: userData.username,
        password_temporal: userData.passwordTemporal
      };
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Actualizar estudiante
  static async update(id, estudianteData) {
    const {
      nombre,
      apellido,
      telefono,
      fecha_nacimiento,
      genero,
      direccion,
      estado
    } = estudianteData;

    const [result] = await pool.execute(`
      UPDATE usuarios 
      SET nombre = ?, apellido = ?, telefono = ?, 
          fecha_nacimiento = ?, genero = ?, direccion = ?, estado = ?
      WHERE id_usuario = ?
    `, [nombre, apellido, telefono, fecha_nacimiento, genero, direccion, estado, id]);

    return result.affectedRows > 0;
  }

  // Obtener cursos matriculados del estudiante
  static async getMisCursos(id_usuario) {
    const [cursos] = await pool.execute(`
      SELECT 
        c.id_curso,
        c.codigo_curso,
        c.nombre,
        c.fecha_inicio,
        c.fecha_fin,
        c.estado as estado_curso,
        tc.nombre as tipo_curso_nombre,
        tc.precio_base,
        m.estado as estado_matricula,
        m.fecha_matricula,
        m.codigo_matricula,
        m.monto_matricula,
        -- Simular progreso y calificación
        FLOOR(60 + RAND() * 40) as progreso,
        ROUND(8 + RAND() * 2, 1) as calificacion_final,
        -- Calcular tareas pendientes (simulado)
        FLOOR(RAND() * 3) as tareas_pendientes,
        -- Próxima clase (simulado)
        DATE_ADD(COALESCE(c.fecha_inicio, CURDATE()), INTERVAL FLOOR(RAND() * 30) DAY) as proxima_clase
      FROM matriculas m
      LEFT JOIN cursos c ON m.id_curso = c.id_curso
      LEFT JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      WHERE m.id_estudiante = ? 
        AND m.estado = 'activa'
      ORDER BY m.fecha_matricula DESC
    `, [id_usuario]);

    return cursos.map(curso => ({
      id_curso: curso.id_curso,
      codigo_curso: curso.codigo_curso || curso.codigo_matricula,
      nombre: curso.nombre,
      fecha_inicio: curso.fecha_inicio,
      fecha_fin: curso.fecha_fin,
      estado: curso.estado_curso,
      tipo_curso: curso.tipo_curso_nombre,
      precio_base: curso.precio_base || curso.monto_matricula,
      progreso: curso.progreso,
      calificacion: curso.calificacion_final,
      tareasPendientes: curso.tareas_pendientes,
      estado_matricula: curso.estado_matricula,
      fecha_matricula: curso.fecha_matricula,
      proximaClase: curso.proxima_clase
    }));
  }

  // Obtener estudiantes recientes
  static async getRecientes(limit = 3) {
    const [estudiantes] = await pool.execute(`
      SELECT 
        u.id_usuario,
        u.username,
        u.cedula,
        u.nombre,
        u.apellido,
        u.password_temporal,
        u.fecha_registro,
        r.nombre_rol
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante'
      ORDER BY u.fecha_registro DESC
      LIMIT ?
    `, [limit]);
    
    return estudiantes.map(est => ({
      id_usuario: est.id_usuario,
      username: est.username,
      cedula: est.cedula,
      nombre: `${est.nombre} ${est.apellido}`,
      password_temporal: est.password_temporal,
      fecha_registro: est.fecha_registro,
      login_info: {
        username: est.username,
        password: est.password_temporal || est.cedula
      }
    }));
  }

  // Verificar si existe estudiante con cédula
  static async existsByCedula(cedula) {
    const [result] = await pool.execute(
      'SELECT COUNT(*) as count FROM usuarios WHERE cedula = ?',
      [cedula]
    );
    return result[0].count > 0;
  }

  // Verificar si el usuario es estudiante
  static async isEstudiante(id_usuario) {
    const [userCheck] = await pool.execute(`
      SELECT u.id_usuario, r.nombre_rol 
      FROM usuarios u 
      JOIN roles r ON u.id_rol = r.id_rol 
      WHERE u.id_usuario = ?
    `, [id_usuario]);
    
    return userCheck.length > 0 && userCheck[0].nombre_rol === 'estudiante';
  }
}

module.exports = EstudiantesModel;
