const { pool } = require('../config/database');

class NotificacionesModel {
    /**
     * Crear una notificación para un usuario
     * @param {Number} id_usuario - ID del usuario
     * @param {String} titulo - Título de la notificación
     * @param {String} mensaje - Mensaje de la notificación
     * @param {String} tipo - Tipo: 'info', 'warning', 'success', 'error'
     * @returns {Number} ID de la notificación creada
     */
    static async crearNotificacion(id_usuario, titulo, mensaje, tipo = 'info') {
        try {
            const [result] = await pool.execute(
                `INSERT INTO notificaciones (id_usuario, titulo, mensaje, tipo, leida, fecha_creacion)
         VALUES (?, ?, ?, ?, FALSE, NOW())`,
                [id_usuario, titulo, mensaje, tipo]
            );
            console.log(`✅ Notificación guardada en BD para usuario ${id_usuario}: "${titulo}"`);
            return result.insertId;
        } catch (error) {
            console.error('Error creando notificación:', error);
            throw error;
        }
    }

    /**
     * Crear notificaciones para múltiples usuarios
     * @param {Array<Number>} userIds - Array de IDs de usuarios
     * @param {String} titulo - Título de la notificación
     * @param {String} mensaje - Mensaje de la notificación
     * @param {String} tipo - Tipo: 'info', 'warning', 'success', 'error'
     */
    static async crearNotificacionMultiple(userIds, titulo, mensaje, tipo = 'info') {
        if (!userIds || userIds.length === 0) {
            console.warn('No hay usuarios para notificar');
            return;
        }

        try {
            const values = userIds.map(id => [id, titulo, mensaje, tipo, false]);

            await pool.query(
                `INSERT INTO notificaciones (id_usuario, titulo, mensaje, tipo, leida, fecha_creacion)
         VALUES ?`,
                [values.map(v => [...v, new Date()])]
            );

            console.log(`✅ ${userIds.length} notificaciones guardadas en BD: "${titulo}"`);
        } catch (error) {
            console.error('Error creando notificaciones múltiples:', error);
            throw error;
        }
    }

    /**
     * Obtener notificaciones de un usuario
     * @param {Number} id_usuario - ID del usuario
     * @param {Number} limit - Límite de notificaciones a obtener
     * @returns {Array} Array de notificaciones
     */
    static async obtenerNotificacionesUsuario(id_usuario, limit = 50) {
        try {
            // Usamos pool.query en lugar de execute para evitar problemas con LIMIT ?
            const [rows] = await pool.query(
                `SELECT 
          id_notificacion,
          id_usuario,
          titulo,
          mensaje,
          tipo,
          leida,
          fecha_creacion,
          fecha_vencimiento
         FROM notificaciones 
         WHERE id_usuario = ? 
         ORDER BY fecha_creacion DESC 
         LIMIT ?`,
                [id_usuario, parseInt(limit)]
            );
            return rows;
        } catch (error) {
            console.error('Error obteniendo notificaciones:', error);
            throw error;
        }
    }

    /**
     * Contar notificaciones no leídas de un usuario
     * @param {Number} id_usuario - ID del usuario
     * @returns {Number} Cantidad de notificaciones no leídas
     */
    static async contarNoLeidas(id_usuario) {
        try {
            const [rows] = await pool.execute(
                `SELECT COUNT(*) as total 
         FROM notificaciones 
         WHERE id_usuario = ? AND leida = FALSE`,
                [id_usuario]
            );
            return rows[0].total;
        } catch (error) {
            console.error('Error contando notificaciones no leídas:', error);
            throw error;
        }
    }

    /**
     * Marcar una notificación como leída
     * @param {Number} id_notificacion - ID de la notificación
     */
    static async marcarComoLeida(id_notificacion) {
        try {
            await pool.execute(
                `UPDATE notificaciones SET leida = TRUE WHERE id_notificacion = ?`,
                [id_notificacion]
            );
            console.log(`✅ Notificación ${id_notificacion} marcada como leída`);
        } catch (error) {
            console.error('Error marcando notificación como leída:', error);
            throw error;
        }
    }

    /**
     * Marcar todas las notificaciones de un usuario como leídas
     * @param {Number} id_usuario - ID del usuario
     */
    static async marcarTodasComoLeidas(id_usuario) {
        try {
            const [result] = await pool.execute(
                `UPDATE notificaciones SET leida = TRUE WHERE id_usuario = ? AND leida = FALSE`,
                [id_usuario]
            );
            console.log(`✅ ${result.affectedRows} notificaciones marcadas como leídas para usuario ${id_usuario}`);
            return result.affectedRows;
        } catch (error) {
            console.error('Error marcando todas las notificaciones como leídas:', error);
            throw error;
        }
    }

    /**
     * Obtener IDs de usuarios por rol
     * @param {String} nombreRol - Nombre del rol ('administrativo', 'admin', 'estudiante', etc.)
     * @returns {Array<Number>} Array de IDs de usuarios
     */
    static async obtenerUsuariosPorRol(nombreRol) {
        try {
            const [rows] = await pool.execute(
                `SELECT u.id_usuario 
         FROM usuarios u
         INNER JOIN roles r ON u.id_rol = r.id_rol
         WHERE r.nombre_rol = ? AND u.estado = 'activo'`,
                [nombreRol]
            );
            return rows.map(r => r.id_usuario);
        } catch (error) {
            console.error('Error obteniendo usuarios por rol:', error);
            throw error;
        }
    }

    /**
     * Eliminar notificaciones antiguas (limpieza)
     * @param {Number} diasAntiguedad - Días de antigüedad para eliminar
     */
    static async eliminarNotificacionesAntiguas(diasAntiguedad = 90) {
        try {
            const [result] = await pool.execute(
                `DELETE FROM notificaciones 
         WHERE fecha_creacion < DATE_SUB(NOW(), INTERVAL ? DAY)`,
                [diasAntiguedad]
            );
            console.log(`🗑️ ${result.affectedRows} notificaciones antiguas eliminadas`);
            return result.affectedRows;
        } catch (error) {
            console.error('Error eliminando notificaciones antiguas:', error);
            throw error;
        }
    }
}

module.exports = NotificacionesModel;
