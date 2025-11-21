const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getUserByEmail, getUserByUsername, getUserById, updateLastLogin, setUserPasswordAndClearTemp } = require('../models/usuarios.model');
const { pool } = require('../config/database');
const { registrarAuditoria } = require('../utils/auditoria');

// JWT_SECRET seguro
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET no configurado en producción'); })()
  : 'dev_secret');

// Función para registrar sesión
async function registrarSesion(id_usuario, token, req) {
  try {
    const id_sesion = crypto.randomBytes(64).toString('hex');
    const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
    const user_agent = req.headers['user-agent'] || 'unknown';
    const fecha_expiracion = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 horas

    await pool.execute(
      `INSERT INTO sesiones_usuario (id_sesion, id_usuario, ip_address, user_agent, fecha_expiracion, activa) 
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [id_sesion, id_usuario, ip_address, user_agent, fecha_expiracion]
    );

    console.log(`Sesión registrada para usuario ${id_usuario}`);
  } catch (error) {
    console.error('Error al registrar sesión:', error);

  }
}

async function loginController(req, res) {
  try {
    const { email, username, password } = req.body;
    if ((!email && !username) || !password) {
      return res.status(400).json({ error: 'Credenciales incompletas' });
    }

    let user = null;

    // Estudiante y Docente: username; Admin/SuperAdmin: email
    if (username) {
      user = await getUserByUsername(username);
      if (!user) return res.status(401).send('Datos incorrectos. Por favor, ingresa un usuario y una contraseña válidos.');
      if (user.nombre_rol !== 'estudiante' && user.nombre_rol !== 'docente') {
        return res.status(403).json({ error: 'Este tipo de usuario debe iniciar sesión con correo' });
      }
    } else {
      user = await getUserByEmail(email);
      if (!user) return res.status(401).send('Datos incorrectos. Por favor, ingresa un usuario y una contraseña válidos.');
      if (user.nombre_rol === 'estudiante' || user.nombre_rol === 'docente') {
        return res.status(403).json({ error: 'Estudiantes y docentes deben iniciar sesión con usuario' });
      }
    }
    if (!user) return res.status(401).send('Datos incorrectos. Por favor, ingresa un usuario y una contraseña válidos.');
    if (user.estado !== 'activo') return res.status(403).json({ error: 'Usuario no activo' });

    // Verificar si la cuenta está bloqueada
    if (user.cuenta_bloqueada) {
      return res.status(403).json({
        success: false,
        bloqueada: true,
        motivo: user.motivo_bloqueo || 'Cuenta bloqueada por falta de pago',
        fecha_bloqueo: user.fecha_bloqueo,
        message: 'Su cuenta ha sido bloqueada. Por favor, contacte con el área administrativa.'
      });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).send('Datos incorrectos. Por favor, ingresa un usuario y una contraseña válidos.');

    const token = jwt.sign(
      { id_usuario: user.id_usuario, rol: user.nombre_rol, email: user.email },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    await updateLastLogin(user.id_usuario);

    // Registrar sesión
    await registrarSesion(user.id_usuario, token, req);

    return res.json({
      token,
      user: {
        id_usuario: user.id_usuario,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.nombre_rol,
        estado: user.estado,
        needs_password_reset: !!user.password_temporal,
        is_first_login: !!user.password_temporal && !user.fecha_ultima_conexion
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ error: 'Error en autenticación' });
  }
}

async function meController(req, res) {
  try {
    const { pool } = require('../config/database');
    const user = await getUserById(req.user.id_usuario);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Si es docente, obtener datos adicionales de la tabla docentes
    if (user.nombre_rol === 'docente') {
      const [docentes] = await pool.execute(`
        SELECT d.identificacion, d.nombres, d.apellidos, d.titulo_profesional, d.experiencia_anos, d.fecha_nacimiento
        FROM docentes d
        WHERE d.identificacion = ?
      `, [user.cedula]);

      if (docentes.length > 0) {
        return res.json({
          id_usuario: user.id_usuario,
          identificacion: docentes[0].identificacion,
          nombre: user.nombre,
          apellido: user.apellido,
          nombres: docentes[0].nombres,  // For consistency with frontend
          apellidos: docentes[0].apellidos,  // For consistency with frontend
          titulo_profesional: docentes[0].titulo_profesional,
          experiencia_anos: docentes[0].experiencia_anos,
          email: user.email,
          telefono: user.telefono || '',
          direccion: user.direccion || '',
          fecha_nacimiento: docentes[0].fecha_nacimiento || user.fecha_nacimiento || null,
          genero: user.genero || '',
          username: user.username,
          rol: user.nombre_rol,
          estado: user.estado,
          fecha_ultima_conexion: user.fecha_ultima_conexion,
          needs_password_reset: !!user.password_temporal,
          is_first_login: !!user.password_temporal && !user.fecha_ultima_conexion,
          foto_perfil: user.foto_perfil || null
        });
      }
    }

    // Para estudiantes, obtener información adicional de la solicitud aprobada
    if (user.nombre_rol === 'estudiante') {
      const [solicitudes] = await pool.execute(`
        SELECT s.contacto_emergencia
        FROM solicitudes_matricula s
        WHERE s.identificacion_solicitante = ? AND s.estado = 'aprobado'
        ORDER BY s.fecha_solicitud DESC
        LIMIT 1
      `, [user.cedula]);

      const contacto_emergencia = solicitudes.length > 0 ? solicitudes[0].contacto_emergencia : null;

      return res.json({
        id_usuario: user.id_usuario,
        cedula: user.cedula || '',
        nombre: user.nombre,
        apellido: user.apellido,
        nombres: user.nombre,  // Add this for consistency
        apellidos: user.apellido,  // Add this for consistency
        email: user.email,
        telefono: user.telefono || '',
        direccion: user.direccion || '',
        fecha_nacimiento: user.fecha_nacimiento || null,
        genero: user.genero || '',
        username: user.username || '',
        rol: user.nombre_rol,
        estado: user.estado,
        fecha_ultima_conexion: user.fecha_ultima_conexion,
        needs_password_reset: !!user.password_temporal,
        is_first_login: !!user.password_temporal && !user.fecha_ultima_conexion,
        foto_perfil: user.foto_perfil || null,
        contacto_emergencia: contacto_emergencia || null // Add this line
      });
    }

    return res.json({
      id_usuario: user.id_usuario,
      cedula: user.cedula || '',
      nombre: user.nombre,
      apellido: user.apellido,
      nombres: user.nombre,  // Add this for consistency
      apellidos: user.apellido,  // Add this for consistency
      email: user.email,
      telefono: user.telefono || '',
      direccion: user.direccion || '',
      fecha_nacimiento: user.fecha_nacimiento || null,
      genero: user.genero || '',
      username: user.username || '',
      rol: user.nombre_rol,
      estado: user.estado,
      fecha_ultima_conexion: user.fecha_ultima_conexion,
      needs_password_reset: !!user.password_temporal,
      is_first_login: !!user.password_temporal && !user.fecha_ultima_conexion,
      foto_perfil: user.foto_perfil || null
    });
  } catch (err) {
    console.error('Error en /me:', err);
    return res.status(500).json({ error: 'Error obteniendo perfil' });
  }
}

// POST /api/auth/reset-password (requiere auth) - Estudiante cambia su contraseña en primer inicio
async function resetPasswordController(req, res) {
  try {
    const { newPassword, confirmPassword } = req.body;
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Nueva contraseña y confirmación son requeridas' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const user = await getUserById(req.user.id_usuario);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Opcional: solo estudiantes deben forzar primer cambio
    // if (user.nombre_rol !== 'estudiante') return res.status(403).json({ error: 'No permitido' });

    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    await setUserPasswordAndClearTemp(user.id_usuario, hash);

    // Registrar auditoría
    await registrarAuditoria({
      tabla_afectada: 'usuarios',
      operacion: 'UPDATE',
      id_registro: user.id_usuario,
      usuario_id: user.id_usuario,
      datos_anteriores: { password_temporal: user.password_temporal },
      datos_nuevos: { password_changed: true },
      ip_address: req.ip || '0.0.0.0',
      user_agent: req.get('user-agent') || 'unknown'
    });

    return res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Error en reset-password:', err);
    return res.status(500).json({ error: 'Error actualizando contraseña' });
  }
}

// POST /api/auth/logout - Cerrar sesión del usuario
async function logoutController(req, res) {
  try {
    const userId = req.user.id_usuario;

    // Actualizar todas las sesiones activas del usuario
    await pool.execute(
      `UPDATE sesiones_usuario 
       SET activa = FALSE, fecha_cierre = CURRENT_TIMESTAMP 
       WHERE id_usuario = ? AND activa = TRUE`,
      [userId]
    );

    console.log(`Sesión cerrada para usuario ${userId}`);

    return res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  } catch (err) {
    console.error('Error en logout:', err);
    return res.status(500).json({ error: 'Error cerrando sesión' });
  }
}

module.exports = { loginController, meController, resetPasswordController, logoutController };
