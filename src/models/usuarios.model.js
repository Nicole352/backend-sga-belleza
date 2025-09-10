const { pool } = require('../config/database');

async function getUserByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT u.*, r.nombre_rol
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function getUserById(id) {
  const [rows] = await pool.execute(
    `SELECT u.*, r.nombre_rol
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.id_usuario = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function updateLastLogin(id_usuario) {
  await pool.execute('UPDATE usuarios SET fecha_ultima_conexion = NOW() WHERE id_usuario = ?', [id_usuario]);
}

async function getUserByCedula(cedula) {
  const [rows] = await pool.execute(
    `SELECT u.*, r.nombre_rol
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.cedula = ?
     LIMIT 1`,
    [cedula]
  );
  return rows[0] || null;
}

async function getRoleByName(nombre_rol) {
  const [rows] = await pool.execute(
    'SELECT * FROM roles WHERE nombre_rol = ? LIMIT 1',
    [nombre_rol]
  );
  return rows[0] || null;
}

async function getAllRoles() {
  const [rows] = await pool.execute('SELECT id_rol, nombre_rol, descripcion, estado FROM roles WHERE estado = "activo" ORDER BY nombre_rol');
  return rows;
}

async function createRole(nombre_rol, descripcion = null) {
  await pool.execute(
    `INSERT INTO roles (nombre_rol, descripcion, estado) VALUES (?, ?, 'activo')
     ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), estado = 'activo'`
  , [nombre_rol, descripcion]);
  const role = await getRoleByName(nombre_rol);
  return role;
}

async function createAdminUser({ cedula, nombre, apellido, email, telefono, fecha_nacimiento, direccion, genero, foto_perfil, passwordHash, id_rol }) {
  const [result] = await pool.execute(
    `INSERT INTO usuarios (
      cedula, nombre, apellido, email, telefono, fecha_nacimiento, direccion, genero, foto_perfil, password, id_rol, estado
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')`,
    [
      cedula,
      nombre,
      apellido,
      email,
      telefono,
      fecha_nacimiento,
      direccion,
      genero,
      foto_perfil,
      passwordHash,
      id_rol
    ]
  );
  const id_usuario = result.insertId;
  const user = await getUserById(id_usuario);
  return user;
}

async function getAdmins() {
  const [rows] = await pool.execute(
    `SELECT u.*, r.nombre_rol
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     WHERE r.nombre_rol = 'administrativo'
     ORDER BY u.fecha_registro DESC`
  );
  return rows;
}

module.exports = {
  getUserByEmail,
  getUserById,
  updateLastLogin,
  getUserByCedula,
  getRoleByName,
  createAdminUser,
  getAdmins,
  getAllRoles,
  createRole,
};
