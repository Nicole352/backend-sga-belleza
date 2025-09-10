const bcrypt = require('bcryptjs');
const { getRoleByName, createAdminUser, getUserByEmail, getUserByCedula, getAdmins, createRole } = require('../models/usuarios.model');

async function createAdminController(req, res) {
  try {
    const { cedula, nombre, apellido, email, telefono, password, fecha_nacimiento, direccion, genero, foto_perfil, roleName } = req.body;
    if (!cedula || !nombre || !apellido || !email || !password) {
      return res.status(400).json({ error: 'cedula, nombre, apellido, email y password son obligatorios' });
    }

    const existsEmail = await getUserByEmail(email);
    if (existsEmail) return res.status(409).json({ error: 'El email ya está registrado' });
    const existsCedula = await getUserByCedula(cedula);
    if (existsCedula) return res.status(409).json({ error: 'La cédula ya está registrada' });

    let role = await getRoleByName(roleName || 'administrativo');
    if (!role) {
      // Auto-crear el rol si no existe para ambientes vacíos
      const nombreRol = roleName || 'administrativo';
      await createRole(nombreRol, `Rol ${nombreRol} creado automáticamente`);
      role = await getRoleByName(nombreRol);
      if (!role) return res.status(500).json({ error: 'No fue posible configurar el rol solicitado' });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await createAdminUser({
      cedula,
      nombre,
      apellido,
      email,
      telefono: telefono || null,
      fecha_nacimiento: fecha_nacimiento || null,
      direccion: direccion || null,
      genero: genero || null,
      foto_perfil: foto_perfil || null,
      passwordHash: hash,
      id_rol: role.id_rol
    });

    return res.status(201).json({
      id_usuario: user.id_usuario,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      telefono: user.telefono,
      rol: 'administrativo',
      estado: user.estado
    });
  } catch (err) {
    console.error('Error creando administrador:', err);
    return res.status(500).json({ error: 'No se pudo crear el administrador' });
  }
}

module.exports = { createAdminController };
 
async function listAdminsController(req, res) {
  try {
    const admins = await getAdmins();
    return res.json(admins.map(a => ({
      id_usuario: a.id_usuario,
      cedula: a.cedula,
      nombre: a.nombre,
      apellido: a.apellido,
      email: a.email,
      telefono: a.telefono,
      rol: a.nombre_rol,
      estado: a.estado,
      fecha_registro: a.fecha_registro,
      fecha_ultima_conexion: a.fecha_ultima_conexion
    })));
  } catch (err) {
    console.error('Error listando administradores:', err);
    return res.status(500).json({ error: 'No se pudo obtener la lista de administradores' });
  }
}

module.exports = { createAdminController, listAdminsController };
