const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Función para generar username único
async function generateUniqueUsername(nombre, apellido) {
  try {
    // Extraer iniciales del nombre (todas las palabras)
    const nombreParts = nombre.trim().split(' ').filter(part => part.length > 0);
    const inicialesNombre = nombreParts.map(part => part.charAt(0).toLowerCase()).join('');
    
    // Extraer primer apellido
    const apellidoParts = apellido.trim().split(' ').filter(part => part.length > 0);
    const primerApellido = apellidoParts[0]?.toLowerCase() || '';
    
    // Crear username base
    const baseUsername = inicialesNombre + primerApellido;
    
    // Verificar si el username ya existe (en columna usuarios.username)
    const [existingUsers] = await pool.execute(
      'SELECT COUNT(*) as count FROM usuarios WHERE username = ?',
      [baseUsername]
    );
    
    if (existingUsers[0].count === 0) {
      return baseUsername;
    }
    
    // Si existe, buscar el siguiente número disponible (usernameX)
    let counter = 2;
    while (counter <= 99) {
      const numberedUsername = baseUsername + counter;
      const [checkUsers] = await pool.execute(
        'SELECT COUNT(*) as count FROM usuarios WHERE username = ?',
        [numberedUsername]
      );
      
      if (checkUsers[0].count === 0) {
        return numberedUsername;
      }
      counter++;
    }
    
    // Fallback si no se puede generar
    return baseUsername + Math.floor(Math.random() * 1000);
  } catch (error) {
    console.error('Error generando username:', error);
    // Fallback en caso de error
    const inicialesNombre = nombre.charAt(0).toLowerCase();
    const primerApellido = apellido.split(' ')[0]?.toLowerCase() || '';
    return inicialesNombre + primerApellido + Math.floor(Math.random() * 100);
  }
}

// POST /api/estudiantes/crear-desde-solicitud
router.post('/crear-desde-solicitud', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id_solicitud, aprobado_por } = req.body;
    
    if (!id_solicitud || !aprobado_por) {
      return res.status(400).json({ 
        error: 'Se requiere id_solicitud y aprobado_por' 
      });
    }
    
    // 1. Obtener datos de la solicitud
    const [solicitudes] = await connection.execute(`
      SELECT 
        s.*,
        tc.nombre AS tipo_curso_nombre
      FROM solicitudes_matricula s
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = s.id_tipo_curso
      WHERE s.id_solicitud = ? AND s.estado = 'pendiente'
    `, [id_solicitud]);
    
    if (solicitudes.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        error: 'Solicitud no encontrada o ya procesada' 
      });
    }
    
    const solicitud = solicitudes[0];
    
    // 2. Verificar que no exista ya un usuario con esa cédula
    const [existingUser] = await connection.execute(
      'SELECT id_usuario FROM usuarios WHERE cedula = ?',
      [solicitud.identificacion_solicitante]
    );
    
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Ya existe un usuario con esa cédula' 
      });
    }
    
    // 3. Obtener el rol de estudiante
    const [roles] = await connection.execute(
      'SELECT id_rol FROM roles WHERE nombre_rol = ?',
      ['estudiante']
    );
    
    let id_rol_estudiante;
    if (roles.length === 0) {
      // Crear rol estudiante si no existe
      const [roleResult] = await connection.execute(
        'INSERT INTO roles (nombre_rol, descripcion, estado) VALUES (?, ?, ?)',
        ['estudiante', 'Estudiante del sistema', 'activo']
      );
      id_rol_estudiante = roleResult.insertId;
    } else {
      id_rol_estudiante = roles[0].id_rol;
    }
    
    // 4. Generar username único
    const username = await generateUniqueUsername(
      solicitud.nombre_solicitante, 
      solicitud.apellido_solicitante
    );
    
    // 5. Guardar email personal del solicitante (solo para contacto/notificaciones).
    //    El login de estudiantes sigue siendo exclusivamente por username.
    const emailEstudiante = solicitud.email_solicitante || null;
    
    // 6. Generar contraseña temporal (documento) con bcrypt
    const passwordTemporal = solicitud.identificacion_solicitante;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(passwordTemporal, salt);
    
    // 7. Crear usuario estudiante
    const [userResult] = await connection.execute(`
      INSERT INTO usuarios (
        cedula, nombre, apellido, fecha_nacimiento, telefono, email, username,
        direccion, genero, password, password_temporal, id_rol, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      solicitud.identificacion_solicitante,
      solicitud.nombre_solicitante,
      solicitud.apellido_solicitante,
      solicitud.fecha_nacimiento_solicitante,
      solicitud.telefono_solicitante,
      emailEstudiante,
      username,
      solicitud.direccion_solicitante,
      solicitud.genero_solicitante,
      hashedPassword,
      passwordTemporal,
      id_rol_estudiante,
      'activo'
    ]);
    
    const id_estudiante = userResult.insertId;
    
    // 8. Crear matrícula automáticamente
    const codigoMatricula = `MAT-${Date.now()}-${id_estudiante}`;
    
    // Obtener el curso asociado al tipo de curso de la solicitud
    const [cursosDisponibles] = await connection.execute(`
      SELECT id_curso FROM cursos 
      WHERE id_tipo_curso = ? AND estado IN ('activo', 'planificado')
      ORDER BY fecha_inicio ASC LIMIT 1
    `, [solicitud.id_tipo_curso]);
    
    let id_curso = null;
    if (cursosDisponibles.length > 0) {
      id_curso = cursosDisponibles[0].id_curso;
    } else {
      // Si no hay curso específico, crear uno temporal o usar un valor por defecto
      console.warn('⚠️ No se encontró curso para el tipo:', solicitud.id_tipo_curso);
      // Por ahora, continuamos sin curso específico
    }
    
    if (id_curso) {
      await connection.execute(`
        INSERT INTO matriculas (
          codigo_matricula, id_solicitud, id_tipo_curso, id_estudiante, 
          id_curso, monto_matricula, email_generado, creado_por, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activa')
      `, [
        codigoMatricula,
        id_solicitud,
        solicitud.id_tipo_curso,
        id_estudiante,
        id_curso,
        solicitud.monto_matricula || 0,
        emailEstudiante || `${username}@estudiante.belleza.com`,
        aprobado_por
      ]);
      
      console.log('✅ Matrícula creada:', codigoMatricula);
    }
    
    // 9. Actualizar estado de la solicitud
    await connection.execute(`
      UPDATE solicitudes_matricula 
      SET estado = 'aprobado', 
          verificado_por = ?, 
          fecha_verificacion = NOW()
      WHERE id_solicitud = ?
    `, [aprobado_por, id_solicitud]);
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Estudiante creado exitosamente',
      estudiante: {
        id_usuario: id_estudiante,
        identificacion: solicitud.identificacion_solicitante,
        nombre: solicitud.nombre_solicitante,
        apellido: solicitud.apellido_solicitante,
        email: emailEstudiante,
        username: username,
        password_temporal: passwordTemporal
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creando estudiante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  } finally {
    connection.release();
  }
});

// GET /api/estudiantes - Obtener todos los estudiantes
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    
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
    
    res.setHeader('X-Total-Count', String(total));
    res.json(estudiantes);
    
  } catch (error) {
    console.error('Error obteniendo estudiantes:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// GET /api/estudiantes/mis-cursos - Obtener cursos matriculados del estudiante autenticado
router.get('/mis-cursos', authMiddleware, async (req, res) => {
  try {
    const id_usuario = req.user?.id_usuario;
    
    if (!id_usuario) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar que el usuario sea estudiante
    const [userCheck] = await pool.execute(`
      SELECT u.id_usuario, r.nombre_rol 
      FROM usuarios u 
      JOIN roles r ON u.id_rol = r.id_rol 
      WHERE u.id_usuario = ?
    `, [id_usuario]);
    
    if (userCheck.length === 0 || userCheck[0].nombre_rol !== 'estudiante') {
      return res.status(403).json({ error: 'Acceso denegado. Solo estudiantes pueden acceder a esta información.' });
    }

    // Obtener cursos matriculados del estudiante
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

    // Transformar datos para el frontend
    const cursosFormateados = cursos.map(curso => ({
      id_curso: curso.id_curso,
      codigo_curso: curso.codigo_curso || curso.codigo_matricula,
      nombre: curso.nombre,
      fecha_inicio: curso.fecha_inicio,
      fecha_fin: curso.fecha_fin,
      estado: curso.estado_curso,
      tipo_curso: curso.tipo_curso_nombre,
      precio_base: curso.precio_base || curso.monto_matricula,
      progreso: curso.progreso, // Ya viene de la consulta SQL
      calificacion: curso.calificacion_final, // Ya viene de la consulta SQL
      tareasPendientes: curso.tareas_pendientes, // Ya viene de la consulta SQL
      estado_matricula: curso.estado_matricula,
      fecha_matricula: curso.fecha_matricula,
      proximaClase: curso.proxima_clase
    }));

    res.json(cursosFormateados);
    
  } catch (error) {
    console.error('Error obteniendo cursos del estudiante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// GET /api/estudiantes/:id - Obtener estudiante por ID
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    
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
    
    if (estudiantes.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    
    res.json(estudiantes[0]);
    
  } catch (error) {
    console.error('Error obteniendo estudiante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// PUT /api/estudiantes/:id - Actualizar estudiante
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    
    const {
      nombre,
      apellido,
      telefono,
      fecha_nacimiento,
      genero,
      direccion,
      estado
    } = req.body;
    
    // Verificar que el estudiante existe
    const [existing] = await pool.execute(`
      SELECT u.id_usuario 
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante' AND u.id_usuario = ?
    `, [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    
    await pool.execute(`
      UPDATE usuarios 
      SET nombre = ?, apellido = ?, telefono = ?, 
          fecha_nacimiento = ?, genero = ?, direccion = ?, estado = ?
      WHERE id_usuario = ?
    `, [nombre, apellido, telefono, fecha_nacimiento, genero, direccion, estado, id]);
    
    res.json({ success: true, message: 'Estudiante actualizado exitosamente' });
    
  } catch (error) {
    console.error('Error actualizando estudiante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// GET /api/estudiantes/debug-recientes - Ver estudiantes recientes (TEMPORAL)
router.get('/debug-recientes', async (req, res) => {
  try {
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
      LIMIT 3
    `);
    
    res.json({
      message: 'Estudiantes recientes (últimos 3)',
      estudiantes: estudiantes.map(est => ({
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
      }))
    });
    
  } catch (error) {
    console.error('Error obteniendo estudiantes recientes:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

module.exports = router;
