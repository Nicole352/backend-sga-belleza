const { pool } = require('../config/database');

/**
 * Middleware de auditoría para registrar operaciones en la base de datos
 * @param {Object} req - Request de Express
 * @param {string} tabla - Nombre de la tabla afectada
 * @param {string} operacion - Tipo de operación: INSERT, UPDATE, DELETE
 * @param {number} idRegistro - ID del registro afectado
 * @param {Object|null} datosAnteriores - Datos antes de la operación (para UPDATE/DELETE)
 * @param {Object|null} datosNuevos - Datos después de la operación (para INSERT/UPDATE)
 */
async function registrarAuditoria(req, tabla, operacion, idRegistro, datosAnteriores = null, datosNuevos = null) {
  try {
    // Capturar información del usuario y contexto
    const usuarioId = req.user?.id_usuario || null;
    const ipAddress = req.ip || req.connection.remoteAddress || null;
    const userAgent = req.get('user-agent') || null;

    // Validar que tengamos al menos el usuario
    if (!usuarioId) {
      console.warn('⚠️ Auditoría sin usuario autenticado:', { tabla, operacion, idRegistro });
      return; // No registrar si no hay usuario (puede ser operación del sistema)
    }

    // Preparar datos para JSON
    const datosAnterioresJSON = datosAnteriores ? JSON.stringify(datosAnteriores) : null;
    const datosNuevosJSON = datosNuevos ? JSON.stringify(datosNuevos) : null;

    // Insertar en tabla de auditoría
    const query = `
      INSERT INTO auditoria_sistema 
        (tabla_afectada, operacion, id_registro, usuario_id, datos_anteriores, datos_nuevos, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await pool.query(query, [
      tabla,
      operacion,
      idRegistro,
      usuarioId,
      datosAnterioresJSON,
      datosNuevosJSON,
      ipAddress,
      userAgent
    ]);

    console.log(`✅ Auditoría registrada: ${operacion} en ${tabla} (ID: ${idRegistro}) por usuario ${usuarioId}`);
  } catch (error) {
    // No lanzar error para no afectar la operación principal
    console.error('❌ Error al registrar auditoría:', error);
    console.error('Detalles:', { tabla, operacion, idRegistro });
  }
}

/**
 * Middleware Express para capturar automáticamente req en el contexto
 * Uso: app.use(auditoriaMiddleware)
 */
function auditoriaMiddleware(req, res, next) {
  // Adjuntar función de auditoría al request para fácil acceso
  req.registrarAuditoria = (tabla, operacion, idRegistro, datosAnteriores = null, datosNuevos = null) => {
    return registrarAuditoria(req, tabla, operacion, idRegistro, datosAnteriores, datosNuevos);
  };
  next();
}

module.exports = {
  registrarAuditoria,
  auditoriaMiddleware
};
