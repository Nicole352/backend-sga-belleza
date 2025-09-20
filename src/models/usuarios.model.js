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
     ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion), estado = 'activo'`,
    [nombre_rol, descripcion]
  );
  const role = await getRoleByName(nombre_rol);
  return role;
}

async function createAdminUser({ cedula, nombre, apellido, email, telefono, fecha_nacimiento, direccion, genero, foto_perfil, foto_mime_type, passwordHash, id_rol }) {
  const [result] = await pool.execute(
    `INSERT INTO usuarios (
      cedula, nombre, apellido, email, telefono, fecha_nacimiento, direccion, foto_perfil, password, id_rol, estado
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')`,
    [
      cedula,
      nombre,
      apellido,
      email,
      telefono,
      fecha_nacimiento,
      direccion,
      foto_perfil || null,
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

async function getAllUsers() {
  const [rows] = await pool.execute(
    `SELECT u.*, r.nombre_rol
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     ORDER BY u.fecha_registro DESC`
  );
  return rows;
}

// Obtener estadísticas de usuarios con porcentajes de crecimiento
async function getUserStats() {
  // Obtener totales actuales
  const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM usuarios WHERE estado = "activo"');
  const [adminRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'administrativo' AND u.estado = "activo"`
  );
  const [studentRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'estudiante' AND u.estado = "activo"`
  );

  // Calcular fechas para comparación mensual
  const fechaActual = new Date();
  const primerDiaMesActual = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 1);
  const primerDiaMesAnterior = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - 1, 1);
  const ultimoDiaMesAnterior = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 0);

  // Obtener totales del mes anterior
  const [totalMesAnterior] = await pool.execute(
    'SELECT COUNT(*) as total FROM usuarios WHERE estado = "activo" AND fecha_registro <= ?',
    [ultimoDiaMesAnterior]
  );
  const [adminMesAnterior] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'administrativo' AND u.estado = "activo" AND u.fecha_registro <= ?`,
    [ultimoDiaMesAnterior]
  );
  const [studentMesAnterior] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'estudiante' AND u.estado = "activo" AND u.fecha_registro <= ?`,
    [ultimoDiaMesAnterior]
  );

  // Calcular porcentajes de crecimiento
  const calcularPorcentaje = (actual, anterior) => {
    if (anterior === 0) return actual > 0 ? 100 : 0;
    return Math.round(((actual - anterior) / anterior) * 100);
  };

  const porcentajeUsuarios = calcularPorcentaje(totalRows[0].total, totalMesAnterior[0].total);
  const porcentajeAdmins = calcularPorcentaje(adminRows[0].total, adminMesAnterior[0].total);
  const porcentajeEstudiantes = calcularPorcentaje(studentRows[0].total, studentMesAnterior[0].total);

  return {
    totalUsuarios: totalRows[0].total,
    totalAdministradores: adminRows[0].total,
    totalEstudiantes: studentRows[0].total,
    porcentajeUsuarios: porcentajeUsuarios,
    porcentajeAdministradores: porcentajeAdmins,
    porcentajeEstudiantes: porcentajeEstudiantes
  };
}

// Obtener estadísticas específicas para Admin
async function getAdminStats() {
  // Obtener totales actuales
  const [adminRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'administrativo' AND u.estado = "activo"`
  );
  const [studentRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'estudiante' AND u.estado = "activo"`
  );
  const [docenteRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'docente' AND u.estado = "activo"`
  );

  // Obtener cursos activos
  const [cursosRows] = await pool.execute(
    'SELECT COUNT(*) as total FROM cursos WHERE estado = "activo"'
  );

  // Obtener matrículas de la tabla correcta
  const [matriculasAceptadas] = await pool.execute(
    'SELECT COUNT(*) as total FROM solicitudes_matricula WHERE estado = "aceptada"'
  );
  const [matriculasPendientes] = await pool.execute(
    'SELECT COUNT(*) as total FROM solicitudes_matricula WHERE estado = "pendiente"'
  );

  // Calcular fechas para comparación mensual
  const fechaActual = new Date();
  const ultimoDiaMesAnterior = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 0);

  // Obtener totales del mes anterior
  const [adminMesAnterior] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'administrativo' AND u.estado = "activo" AND u.fecha_registro <= ?`,
    [ultimoDiaMesAnterior]
  );
  const [studentMesAnterior] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'estudiante' AND u.estado = "activo" AND u.fecha_registro <= ?`,
    [ultimoDiaMesAnterior]
  );
  const [docenteMesAnterior] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'docente' AND u.estado = "activo" AND u.fecha_registro <= ?`,
    [ultimoDiaMesAnterior]
  );
  const [cursosMesAnterior] = await pool.execute(
    'SELECT COUNT(*) as total FROM cursos WHERE estado = "activo" AND fecha_inicio <= ?',
    [ultimoDiaMesAnterior]
  );
  const [matriculasAceptadasMesAnterior] = await pool.execute(
    'SELECT COUNT(*) as total FROM solicitudes_matricula WHERE estado = "aceptada" AND fecha_solicitud <= ?',
    [ultimoDiaMesAnterior]
  );
  const [matriculasPendientesMesAnterior] = await pool.execute(
    'SELECT COUNT(*) as total FROM solicitudes_matricula WHERE estado = "pendiente" AND fecha_solicitud <= ?',
    [ultimoDiaMesAnterior]
  );

  // Calcular porcentajes de crecimiento
  const calcularPorcentaje = (actual, anterior) => {
    if (anterior === 0) return actual > 0 ? 100 : 0;
    return Math.round(((actual - anterior) / anterior) * 100);
  };

  return {
    totalAdministradores: adminRows[0].total,
    totalEstudiantes: studentRows[0].total,
    totalDocentes: docenteRows[0].total,
    cursosActivos: cursosRows[0].total,
    matriculasAceptadas: matriculasAceptadas[0].total,
    matriculasPendientes: matriculasPendientes[0].total,
    porcentajeAdministradores: calcularPorcentaje(adminRows[0].total, adminMesAnterior[0].total),
    porcentajeEstudiantes: calcularPorcentaje(studentRows[0].total, studentMesAnterior[0].total),
    porcentajeDocentes: calcularPorcentaje(docenteRows[0].total, docenteMesAnterior[0].total),
    porcentajeCursos: calcularPorcentaje(cursosRows[0].total, cursosMesAnterior[0].total),
    porcentajeMatriculasAceptadas: calcularPorcentaje(matriculasAceptadas[0].total, matriculasAceptadasMesAnterior[0].total),
    porcentajeMatriculasPendientes: calcularPorcentaje(matriculasPendientes[0].total, matriculasPendientesMesAnterior[0].total)
  };
}

// Actualizar datos de un usuario (campos opcionales)
async function updateAdminUser(id_usuario, fields) {
  const allowed = {
    nombre: 'nombre',
    apellido: 'apellido',
    email: 'email',
    telefono: 'telefono',
    fecha_nacimiento: 'fecha_nacimiento',
    direccion: 'direccion',
    id_rol: 'id_rol',
    foto_perfil: 'foto_perfil'
  };

  const setParts = [];
  const values = [];
  Object.keys(allowed).forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(fields, k) && fields[k] !== undefined) {
      setParts.push(`${allowed[k]} = ?`);
      values.push(fields[k]);
    }
  });

  if (setParts.length === 0) return await getUserById(id_usuario);

  values.push(id_usuario);
  const sql = `UPDATE usuarios SET ${setParts.join(', ')} WHERE id_usuario = ?`;
  await pool.execute(sql, values);
  const user = await getUserById(id_usuario);
  return user;
}

// Actualizar contraseña de un usuario
async function updateUserPassword(id_usuario, passwordHash) {
  await pool.execute('UPDATE usuarios SET password = ? WHERE id_usuario = ?', [passwordHash, id_usuario]);
  const user = await getUserById(id_usuario);
  return user;
}

module.exports = {
  getUserByEmail,
  getUserById,
  updateLastLogin,
  getUserByCedula,
  getRoleByName,
  createAdminUser,
  getAdmins,
  getAllUsers,
  getUserStats,
  getAdminStats,
  getAllRoles,
  createRole,
  updateAdminUser,
  updateUserPassword,
};