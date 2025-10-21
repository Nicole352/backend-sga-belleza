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

// Obtener usuario por username (para login de estudiantes)
async function getUserByUsername(username) {
  const [rows] = await pool.execute(
    `SELECT u.*, r.nombre_rol
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     WHERE u.username = ?
     LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

async function getUserById(id) {
  const [rows] = await pool.execute(
    `SELECT 
      u.id_usuario,
      u.cedula,
      u.nombre,
      u.apellido,
      u.fecha_nacimiento,
      u.telefono,
      u.email,
      u.username,
      u.direccion,
      u.genero,
      CASE 
        WHEN u.foto_perfil IS NOT NULL THEN CONCAT('data:image/jpeg;base64,', TO_BASE64(u.foto_perfil))
        ELSE NULL 
      END as foto_perfil,
      u.password,
      u.password_temporal,
      u.needs_password_reset,
      u.id_rol,
      u.estado,
      u.fecha_registro,
      u.fecha_ultima_conexion,
      r.nombre_rol
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

// Actualizar contraseña y limpiar password_temporal (uso: primer ingreso estudiante)
async function setUserPasswordAndClearTemp(id_usuario, passwordHash) {
  await pool.execute('UPDATE usuarios SET password = ?, password_temporal = NULL WHERE id_usuario = ?', [passwordHash, id_usuario]);
  const user = await getUserById(id_usuario);
  return user;
}

// ========================================
// FUNCIONES PARA CONTROL DE USUARIOS
// ========================================

// Obtener lista paginada de usuarios con filtros
async function getAllUsersWithFilters({ search = '', rol = 'todos', estado = 'todos', page = 1, limit = 10 }) {
  // Asegurar que page y limit sean números válidos
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const offset = (pageNum - 1) * limitNum;
  
  let whereConditions = [];
  let params = [];

  // Búsqueda por nombre, username o email
  if (search) {
    whereConditions.push('(u.nombre LIKE ? OR u.apellido LIKE ? OR u.username LIKE ? OR u.email LIKE ?)');
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
  }

  // Filtro por rol
  if (rol !== 'todos') {
    whereConditions.push('r.nombre_rol = ?');
    params.push(rol);
  }

  // Filtro por estado
  if (estado !== 'todos') {
    whereConditions.push('u.estado = ?');
    params.push(estado);
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // Consulta para obtener usuarios (incluye foto_perfil como base64)
  const query = `
    SELECT 
      u.id_usuario, 
      u.cedula, 
      u.nombre, 
      u.apellido, 
      u.email, 
      u.username, 
      u.telefono, 
      u.estado, 
      u.fecha_ultima_conexion, 
      u.fecha_registro, 
      r.nombre_rol,
      CASE 
        WHEN u.foto_perfil IS NOT NULL THEN CONCAT('data:image/jpeg;base64,', TO_BASE64(u.foto_perfil))
        ELSE NULL 
      END as foto_perfil
    FROM usuarios u 
    JOIN roles r ON r.id_rol = u.id_rol 
    ${whereClause} 
    ORDER BY u.fecha_ultima_conexion DESC 
    LIMIT ? OFFSET ?
  `;

  const queryParams = [...params, limitNum, offset];
  console.log('Query params:', queryParams);
  console.log('Types:', queryParams.map(p => typeof p));
  
  const [rows] = await pool.query(query, queryParams);
  
  // DEBUG: Verificar fotos (simplificado)
  const conFoto = rows.filter(u => u.foto_perfil).length;
  console.log('📸 Backend - Usuarios con foto:', conFoto, 'de', rows.length);

  // Consulta para obtener total de registros
  const countQuery = `
    SELECT COUNT(*) as total
    FROM usuarios u
    JOIN roles r ON r.id_rol = u.id_rol
    ${whereClause}
  `;

  const [countRows] = await pool.query(countQuery, params);
  const total = countRows[0].total;

  return {
    usuarios: rows,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum)
  };
}

// Obtener estadísticas de usuarios para Control de Usuarios
async function getControlUsuariosStats() {
  // Total de usuarios
  const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM usuarios');
  
  // Usuarios activos
  const [activosRows] = await pool.execute('SELECT COUNT(*) as total FROM usuarios WHERE estado = "activo"');
  
  // Usuarios inactivos
  const [inactivosRows] = await pool.execute('SELECT COUNT(*) as total FROM usuarios WHERE estado = "inactivo"');
  
  // Por rol
  const [adminRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'administrativo'`
  );
  
  const [docenteRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'docente'`
  );
  
  const [estudianteRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM usuarios u 
     JOIN roles r ON r.id_rol = u.id_rol 
     WHERE r.nombre_rol = 'estudiante'`
  );

  return {
    totalUsuarios: totalRows[0].total,
    usuariosActivos: activosRows[0].total,
    usuariosInactivos: inactivosRows[0].total,
    totalAdministradores: adminRows[0].total,
    totalDocentes: docenteRows[0].total,
    totalEstudiantes: estudianteRows[0].total
  };
}

// Cambiar estado de un usuario
async function changeUserStatus(id_usuario, nuevoEstado) {
  await pool.execute(
    'UPDATE usuarios SET estado = ? WHERE id_usuario = ?',
    [nuevoEstado, id_usuario]
  );
  const user = await getUserById(id_usuario);
  return user;
}

// Resetear contraseña de un usuario (genera nueva contraseña temporal)
async function resetUserPassword(id_usuario, nuevaPasswordTemporal, passwordHash) {
  await pool.execute(
    'UPDATE usuarios SET password = ?, password_temporal = ?, needs_password_reset = TRUE WHERE id_usuario = ?',
    [passwordHash, nuevaPasswordTemporal, id_usuario]
  );
  const user = await getUserById(id_usuario);
  return user;
}

// Obtener últimas sesiones de un usuario
async function getUserSessions(id_usuario, limit = 10) {
  const [rows] = await pool.execute(
    `SELECT 
      id_sesion,
      ip_address,
      user_agent,
      fecha_inicio,
      fecha_expiracion,
      activa
    FROM sesiones_usuario
    WHERE id_usuario = ?
    ORDER BY fecha_inicio DESC
    LIMIT ?`,
    [id_usuario, limit]
  );
  return rows;
}

// Obtener últimas acciones de un usuario desde auditoría
async function getUserActions(id_usuario, limit = 20) {
  const [rows] = await pool.execute(
    `SELECT 
      id_auditoria,
      tabla_afectada,
      operacion,
      id_registro,
      ip_address,
      fecha_operacion
    FROM auditoria_sistema
    WHERE usuario_id = ?
    ORDER BY fecha_operacion DESC
    LIMIT ?`,
    [id_usuario, limit]
  );
  return rows;
}

// ========================================
// FUNCIONES PARA FOTO DE PERFIL
// ========================================

// Actualizar foto de perfil (guardar en BLOB)
async function updateFotoPerfil(id_usuario, fotoBuffer) {
  await pool.execute(
    'UPDATE usuarios SET foto_perfil = ? WHERE id_usuario = ?',
    [fotoBuffer, id_usuario]
  );
  return await getUserById(id_usuario);
}

// Obtener foto de perfil
async function getFotoPerfil(id_usuario) {
  const [rows] = await pool.execute(
    'SELECT foto_perfil FROM usuarios WHERE id_usuario = ?',
    [id_usuario]
  );
  return rows[0]?.foto_perfil || null;
}

// Eliminar foto de perfil
async function deleteFotoPerfil(id_usuario) {
  await pool.execute(
    'UPDATE usuarios SET foto_perfil = NULL WHERE id_usuario = ?',
    [id_usuario]
  );
  return await getUserById(id_usuario);
}

module.exports = {
  getUserByEmail,
  getUserByUsername,
  getUserById,
  updateLastLogin,
  getUserByCedula,
  getRoleByName,
  createRole,
  getAllRoles,
  createAdminUser,
  getAdmins,
  getAllUsers,
  getUserStats,
  getAdminStats,
  updateAdminUser,
  updateUserPassword,
  setUserPasswordAndClearTemp,
  // Funciones para Control de Usuarios
  getAllUsersWithFilters,
  getControlUsuariosStats,
  changeUserStatus,
  resetUserPassword,
  getUserSessions,
  getUserActions,
  // Funciones para Foto de Perfil
  updateFotoPerfil,
  getFotoPerfil,
  deleteFotoPerfil
};