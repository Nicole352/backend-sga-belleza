const { pool } = require('../config/database');

/**
 * Registra una acción en la tabla de auditoría
 * @param {string} tabla_afectada - Nombre de la tabla afectada
 * @param {string} operacion - INSERT, UPDATE o DELETE
 * @param {number} id_registro - ID del registro afectado
 * @param {number} usuario_id - ID del usuario que realizó la acción
 * @param {object} datos_anteriores - Datos antes del cambio (para UPDATE/DELETE)
 * @param {object} datos_nuevos - Datos después del cambio (para INSERT/UPDATE)
 * @param {object} req - Request de Express (para obtener IP y user agent)
 */
async function registrarAuditoria(tabla_afectada, operacion, id_registro, usuario_id, datos_anteriores = null, datos_nuevos = null, req = null) {
  try {
    const ip_address = req ? (req.ip || req.connection.remoteAddress || 'unknown') : 'system';
    const user_agent = req ? (req.headers['user-agent'] || 'unknown') : 'system';

    await pool.execute(
      `INSERT INTO auditoria_sistema 
       (tabla_afectada, operacion, id_registro, usuario_id, datos_anteriores, datos_nuevos, ip_address, user_agent) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tabla_afectada,
        operacion,
        id_registro,
        usuario_id,
        datos_anteriores ? JSON.stringify(datos_anteriores) : null,
        datos_nuevos ? JSON.stringify(datos_nuevos) : null,
        ip_address,
        user_agent
      ]
    );

    console.log(`📝 Auditoría: ${operacion} en ${tabla_afectada} (ID: ${id_registro}) por usuario ${usuario_id}`);
  } catch (error) {
    console.error('Error al registrar auditoría:', error);
    // No lanzamos error para no interrumpir la operación principal
  }
}

module.exports = { registrarAuditoria };
