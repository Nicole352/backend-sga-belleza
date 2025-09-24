const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUserByEmail, getUserByUsername, getUserById, updateLastLogin, setUserPasswordAndClearTemp } = require('../models/usuarios.model');

async function loginController(req, res) {
  try {
    const { email, username, password } = req.body;
    if ((!email && !username) || !password) {
      return res.status(400).json({ error: 'Credenciales incompletas' });
    }

    let user = null;

    // Estudiante: username; Admin/SuperAdmin: email
    if (username) {
      user = await getUserByUsername(username);
      if (!user) return res.status(401).send('Datos incorrectos. Por favor, ingresa un usuario y una contraseña válidos.');
      if (user.nombre_rol !== 'estudiante') {
        return res.status(403).json({ error: 'Este tipo de usuario debe iniciar sesión con correo' });
      }
    } else {
      user = await getUserByEmail(email);
      if (!user) return res.status(401).send('Datos incorrectos. Por favor, ingresa un usuario y una contraseña válidos.');
      if (user.nombre_rol === 'estudiante') {
        return res.status(403).json({ error: 'Estudiante debe iniciar sesión con usuario' });
      }
    }
    if (!user) return res.status(401).send('Datos incorrectos. Por favor, ingresa un usuario y una contraseña válidos.');
    if (user.estado !== 'activo') return res.status(403).json({ error: 'Usuario no activo' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).send('Datos incorrectos. Por favor, ingresa un usuario y una contraseña válidos.');

    const token = jwt.sign(
      { id_usuario: user.id_usuario, rol: user.nombre_rol, email: user.email },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '8h' }
    );

    await updateLastLogin(user.id_usuario);

    return res.json({
      token,
      user: {
        id_usuario: user.id_usuario,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.nombre_rol,
        estado: user.estado
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ error: 'Error en autenticación' });
  }
}

async function meController(req, res) {
  try {
    const user = await getUserById(req.user.id_usuario);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json({
      id_usuario: user.id_usuario,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      rol: user.nombre_rol,
      estado: user.estado,
      fecha_ultima_conexion: user.fecha_ultima_conexion,
      needs_password_reset: !!user.password_temporal
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

    return res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Error en reset-password:', err);
    return res.status(500).json({ error: 'Error actualizando contraseña' });
  }
}

module.exports = { loginController, meController, resetPasswordController };
