const { pool } = require('../config/database');

/**
 * Registra una acción en la tabla de auditoría
 * @param {object} params - Parámetros de auditoría
 * @param {string} params.tabla_afectada - Nombre de la tabla afectada
 * @param {string} params.operacion - INSERT, UPDATE o DELETE
 * @param {number} params.id_registro - ID del registro afectado
 * @param {number} params.usuario_id - ID del usuario que realizó la acción
 * @param {object} params.datos_anteriores - Datos antes del cambio (para UPDATE/DELETE)
 * @param {object} params.datos_nuevos - Datos después del cambio (para INSERT/UPDATE)
 * @param {string} params.ip_address - Dirección IP del usuario
 * @param {string} params.user_agent - User agent del navegador
 */
async function registrarAuditoria(params) {
  try {
    const {
      tabla_afectada,
      operacion,
      id_registro,
      usuario_id,
      datos_anteriores = null,
      datos_nuevos = null,
      ip_address = '0.0.0.0',
      user_agent = 'unknown'
    } = params;

    await pool.execute(
      `INSERT INTO auditoria_sistema 
       (tabla_afectada, operacion, id_registro, usuario_id, datos_anteriores, datos_nuevos, ip_address, user_agent) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tabla_afectada,
        operacion,
        id_registro,
        usuario_id || null,
        datos_anteriores ? JSON.stringify(datos_anteriores) : null,
        datos_nuevos ? JSON.stringify(datos_nuevos) : null,
        ip_address,
        user_agent
      ]
    );

    console.log(`📝 Auditoría: ${operacion} en ${tabla_afectada} (ID: ${id_registro}) por usuario ${usuario_id || 'sistema'}`);
  } catch (error) {
    console.error('Error al registrar auditoría:', error);
    // No lanzamos error para no interrumpir la operación principal
  }
}

module.exports = { registrarAuditoria };
