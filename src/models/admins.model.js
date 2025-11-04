const { pool } = require('../config/database');

/**
 * Obtener todos los administradores activos
 */
async function getActiveAdmins() {
  const [rows] = await pool.execute(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.email 
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     WHERE r.nombre_rol = 'administrativo'
     AND u.estado = 'activo'`
  );
  return rows;
}

module.exports = {
  getActiveAdmins
};