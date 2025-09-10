const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUserByEmail, getUserById, updateLastLogin } = require('../models/usuarios.model');

async function loginController(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    if (user.estado !== 'activo') return res.status(403).json({ error: 'Usuario no activo' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

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
      fecha_ultima_conexion: user.fecha_ultima_conexion
    });
  } catch (err) {
    console.error('Error en /me:', err);
    return res.status(500).json({ error: 'Error obteniendo perfil' });
  }
}

module.exports = { loginController, meController };
