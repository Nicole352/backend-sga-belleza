const { pool } = require('../config/database');
const { emitToUser, emitToRole } = require('./socket.service');
const emailService = require('./emailService');

class TemporaryUnblockService {
    /**
     * Concede desbloqueo temporal de 24 horas
     * @param {number} id_estudiante - ID del estudiante a desbloquear
     * @param {number} id_admin - ID del admin que concede el desbloqueo
     * @param {Object} req - Request object para WebSocket
     * @returns {Promise<Object>}
     */
    static async grantTemporaryUnblock(id_estudiante, id_admin, req = null) {
        try {
            // Calcular fecha de expiración (24 horas desde ahora)
            const expiraEn24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

            // Actualizar usuario
            await pool.execute(`
        UPDATE usuarios 
        SET cuenta_bloqueada = FALSE,
            desbloqueo_temporal = TRUE,
            fecha_desbloqueo_temporal = NOW(),
            expira_desbloqueo = ?,
            motivo_bloqueo = NULL
        WHERE id_usuario = ?
      `, [expiraEn24h, id_estudiante]);

            // Obtener datos del estudiante
            const [estudiante] = await pool.execute(`
        SELECT nombre, apellido, email
        FROM usuarios
        WHERE id_usuario = ?
      `, [id_estudiante]);

            // Registrar en auditoría
            await pool.execute(`
        INSERT INTO auditoria_sistema (
          tabla_afectada, 
          operacion, 
          id_registro, 
          usuario_id,
          datos_nuevos
        ) VALUES (?, ?, ?, ?, ?)
      `, [
                'usuarios',
                'UPDATE',
                id_estudiante,
                id_admin,
                JSON.stringify({
                    accion: 'DESBLOQUEO_TEMPORAL',
                    duracion: '24 horas',
                    expira: expiraEn24h,
                    admin_id: id_admin
                })
            ]);

            // Notificar al estudiante vía WebSocket
            if (req) {
                emitToUser(req, id_estudiante, 'desbloqueo_temporal', {
                    tipo: 'desbloqueo_temporal',
                    expira: expiraEn24h,
                    mensaje: 'Su cuenta ha sido desbloqueada temporalmente. Tiene 24 horas para subir la evidencia de pago.',
                    horas_restantes: 24
                });
            }

            // Enviar email de notificación
            if (estudiante.length > 0 && estudiante[0].email) {
                try {
                    await emailService.enviarNotificacionDesbloqueoTemporal(
                        estudiante[0].email,
                        `${estudiante[0].nombre} ${estudiante[0].apellido}`,
                        expiraEn24h
                    );
                } catch (emailError) {
                    console.error('Error enviando email de desbloqueo temporal:', emailError);
                    // No interrumpimos el flujo si falla el email
                }
            }

            // Guardar notificación en la base de datos para que persista
            try {
                await pool.execute(`
                    INSERT INTO notificaciones (
                        id_usuario,
                        titulo,
                        mensaje,
                        tipo,
                        leida,
                        fecha_creacion
                    ) VALUES (?, ?, ?, ?, ?, NOW())
                `, [
                    id_estudiante,
                    'Desbloqueo Temporal Concedido',
                    'Tienes 24 horas para subir la evidencia de pago. Si no lo haces, tu cuenta se bloqueará automáticamente.',
                    'warning',
                    false
                ]);
                console.log(`Notificación guardada en BD para estudiante ${id_estudiante}`);
            } catch (notifError) {
                console.error('Error guardando notificación en BD:', notifError);
                // No lanzar error, la funcionalidad principal debe continuar
            }

            console.log(`Desbloqueo temporal concedido: ${estudiante[0]?.nombre} ${estudiante[0]?.apellido} (24h)`);

            return {
                success: true,
                mensaje: 'Desbloqueo temporal concedido por 24 horas',
                expira: expiraEn24h,
                estudiante: estudiante[0]
            };
        } catch (error) {
            console.error('Error concediendo desbloqueo temporal:', error);
            throw error;
        }
    }

    /**
     * Hace permanente el desbloqueo (cuando se aprueba el pago)
     * @param {number} id_estudiante - ID del estudiante
     * @returns {Promise<void>}
     */
    static async makePermanentUnblock(id_estudiante) {
        try {
            await pool.execute(`
        UPDATE usuarios 
        SET desbloqueo_temporal = FALSE,
            fecha_desbloqueo_temporal = NULL,
            expira_desbloqueo = NULL
        WHERE id_usuario = ?
      `, [id_estudiante]);

            // Registrar en auditoría
            await pool.execute(`
        INSERT INTO auditoria_sistema (
          tabla_afectada, 
          operacion, 
          id_registro, 
          datos_nuevos
        ) VALUES (?, ?, ?, ?)
      `, [
                'usuarios',
                'UPDATE',
                id_estudiante,
                JSON.stringify({
                    accion: 'DESBLOQUEO_PERMANENTE',
                    motivo: 'Pago aprobado'
                })
            ]);

            // Notificar al estudiante
            // NOTA: Comentado temporalmente porque emitToUser requiere 'req' como primer parámetro
            // emitToUser(id_estudiante, 'desbloqueo_permanente', {
            //     tipo: 'desbloqueo_permanente',
            //     mensaje: 'Su cuenta ha sido desbloqueada permanentemente. Pago verificado.'
            // });

            console.log(`✓ Desbloqueo permanente: Estudiante ${id_estudiante}`);
        } catch (error) {
            console.error('Error haciendo desbloqueo permanente:', error);
            throw error;
        }
    }

    /**
     * Verifica y re-bloquea desbloqueos temporales expirados
     * @returns {Promise<number>} Número de cuentas re-bloqueadas
     */
    static async checkExpiredUnblocks() {
        try {
            // Buscar desbloqueos temporales expirados
            const [expired] = await pool.execute(`
        SELECT id_usuario, nombre, apellido, email, expira_desbloqueo
        FROM usuarios
        WHERE desbloqueo_temporal = TRUE
          AND expira_desbloqueo < NOW()
      `);

            if (expired.length === 0) {
                return 0;
            }

            console.log(`\n⏰ Desbloqueos temporales expirados: ${expired.length}`);

            for (const user of expired) {
                // Re-bloquear cuenta
                const motivo = 'Desbloqueo temporal expirado - No subió evidencia de pago en 24 horas';

                await pool.execute(`
          UPDATE usuarios 
          SET cuenta_bloqueada = TRUE,
              desbloqueo_temporal = FALSE,
              fecha_desbloqueo_temporal = NULL,
              expira_desbloqueo = NULL,
              motivo_bloqueo = ?,
              fecha_bloqueo = NOW()
          WHERE id_usuario = ?
        `, [motivo, user.id_usuario]);

                // Registrar en auditoría
                await pool.execute(`
          INSERT INTO auditoria_sistema (
            tabla_afectada, 
            operacion, 
            id_registro, 
            datos_nuevos
          ) VALUES (?, ?, ?, ?)
        `, [
                    'usuarios',
                    'UPDATE',
                    user.id_usuario,
                    JSON.stringify({
                        accion: 'RE_BLOQUEO_AUTOMATICO',
                        motivo: motivo,
                        expiro: user.expira_desbloqueo
                    })
                ]);

                // Notificar al estudiante
                // NOTA: Comentado temporalmente porque emitToUser requiere 'req' como primer parámetro
                // emitToUser(user.id_usuario, 'cuenta_bloqueada', {
                //     tipo: 'cuenta_bloqueada',
                //     motivo: motivo,
                //     fecha_bloqueo: new Date()
                // });

                // Notificar a administradores
                // NOTA: Comentado temporalmente porque emitToRole requiere 'req' como primer parámetro
                // emitToRole('administrativo', 'cuenta_rebloqueada', {
                //     tipo: 'cuenta_rebloqueada',
                //     nombre_estudiante: `${user.nombre} ${user.apellido}`,
                //     motivo: motivo
                // });

                console.log(`  🔒 Re-bloqueado: ${user.nombre} ${user.apellido}`);
            }

            return expired.length;
        } catch (error) {
            console.error('Error verificando desbloqueos expirados:', error);
            throw error;
        }
    }

    /**
     * Obtiene información de desbloqueo temporal de un estudiante
     * @param {number} id_estudiante 
     * @returns {Promise<Object>}
     */
    static async getTemporaryUnblockInfo(id_estudiante) {
        try {
            const [rows] = await pool.execute(`
        SELECT 
          desbloqueo_temporal,
          fecha_desbloqueo_temporal,
          expira_desbloqueo,
          TIMESTAMPDIFF(HOUR, NOW(), expira_desbloqueo) as horas_restantes,
          TIMESTAMPDIFF(MINUTE, NOW(), expira_desbloqueo) as minutos_restantes
        FROM usuarios
        WHERE id_usuario = ?
      `, [id_estudiante]);

            return rows[0] || null;
        } catch (error) {
            console.error('Error obteniendo info de desbloqueo temporal:', error);
            throw error;
        }
    }
}

module.exports = TemporaryUnblockService;
