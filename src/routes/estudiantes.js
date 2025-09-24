const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

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
    
    // 8. Actualizar estado de la solicitud
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
        cedula: solicitud.identificacion_solicitante,
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
        u.cedula,
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
        u.cedula,
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

module.exports = router;
