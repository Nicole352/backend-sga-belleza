const { pool } = require('../config/database');
const { emitToUser, emitToRole } = require('./socket.service');
const emailService = require('./emailService');

class PaymentReminderService {
    /**
     * Obtiene todos los estudiantes con cuotas vencidas
     * @returns {Promise<Array>} Lista de estudiantes con cuotas vencidas
     */
    static async getEstudiantesConCuotasVencidas() {
        const [rows] = await pool.execute(`
      SELECT 
        u.id_usuario,
        u.nombre,
        u.apellido,
        u.email,
        u.cuenta_bloqueada,
        COUNT(DISTINCT pm.id_pago) as cuotas_vencidas,
        MIN(pm.fecha_vencimiento) as primera_cuota_vencida,
        MAX(pm.fecha_vencimiento) as ultima_cuota_vencida,
        GROUP_CONCAT(
          CONCAT(
            'Cuota #', pm.numero_cuota, 
            ' - $', pm.monto, 
            ' (Vence: ', DATE_FORMAT(pm.fecha_vencimiento, '%d/%m/%Y'), ')'
          ) 
          ORDER BY pm.fecha_vencimiento 
          SEPARATOR ' | '
        ) as detalle_cuotas
      FROM usuarios u
      INNER JOIN matriculas m ON u.id_usuario = m.id_estudiante
      INNER JOIN pagos_mensuales pm ON m.id_matricula = pm.id_matricula
      WHERE pm.estado = 'pendiente'
        AND pm.fecha_vencimiento < CURDATE()
        AND u.id_rol = (SELECT id_rol FROM roles WHERE nombre_rol = 'estudiante')
      GROUP BY u.id_usuario, u.nombre, u.apellido, u.email, u.cuenta_bloqueada
      HAVING cuotas_vencidas > 0
      ORDER BY cuotas_vencidas DESC
    `);
        return rows;
    }

    /**
     * Obtiene cuotas que vencen hoy o están vencidas para un estudiante
     * @param {number} id_estudiante 
     * @returns {Promise<Array>}
     */
    static async getCuotasVencidasOProximasAVencer(id_estudiante) {
        const [rows] = await pool.execute(`
      SELECT 
        pm.id_pago,
        pm.numero_cuota,
        pm.monto,
        pm.fecha_vencimiento,
        pm.estado,
        c.nombre as curso_nombre,
        tc.nombre as tipo_curso_nombre,
        DATEDIFF(pm.fecha_vencimiento, CURDATE()) as dias_restantes
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      WHERE m.id_estudiante = ?
        AND pm.estado = 'pendiente'
        AND DATEDIFF(pm.fecha_vencimiento, CURDATE()) BETWEEN -1 AND 0
      ORDER BY pm.fecha_vencimiento ASC
    `, [id_estudiante]);
        return rows;
    }

    /**
     * Verifica cuotas vencidas y envía recordatorios
     */
    static async checkOverduePayments() {
        try {
            console.log('=== VERIFICACIÓN DE PAGOS VENCIDOS ===');
            console.log('Fecha/Hora:', new Date().toLocaleString('es-EC'));

            const estudiantes = await this.getEstudiantesConCuotasVencidas();

            console.log(`Total estudiantes con cuotas vencidas: ${estudiantes.length}`);

            for (const estudiante of estudiantes) {
                console.log(`\n- ${estudiante.nombre} ${estudiante.apellido}`);
                console.log(`  Cuotas vencidas: ${estudiante.cuotas_vencidas}`);
                console.log(`  Cuenta bloqueada: ${estudiante.cuenta_bloqueada ? 'SÍ' : 'NO'}`);
            }

            return estudiantes;
        } catch (error) {
            console.error('Error verificando pagos vencidos:', error);
            throw error;
        }
    }

    /**
     * Envía recordatorios de pago a estudiantes
     */
    static async sendPaymentReminders() {
        try {
            console.log('\n=== ENVIANDO RECORDATORIOS DE PAGO ===');

            // Obtener todos los estudiantes activos
            const [estudiantes] = await pool.execute(`
        SELECT id_usuario, nombre, apellido, email
        FROM usuarios
        WHERE id_rol = (SELECT id_rol FROM roles WHERE nombre_rol = 'estudiante')
          AND estado = 'activo'
          AND cuenta_bloqueada = FALSE
      `);

            let recordatoriosEnviados = 0;

            for (const estudiante of estudiantes) {
                const cuotas = await this.getCuotasVencidasOProximasAVencer(estudiante.id_usuario);

                if (cuotas.length > 0) {
                    for (const cuota of cuotas) {
                        const mensaje = this.generarMensajeRecordatorio(cuota);

                        // Enviar notificación WebSocket
                        emitToUser(estudiante.id_usuario, 'recordatorio_pago', {
                            tipo: 'recordatorio_pago',
                            numero_cuota: cuota.numero_cuota,
                            monto: cuota.monto,
                            fecha_vencimiento: cuota.fecha_vencimiento,
                            dias_restantes: cuota.dias_restantes,
                            curso_nombre: cuota.curso_nombre,
                            mensaje: mensaje
                        });

                        recordatoriosEnviados++;
                    }
                }
            }

            console.log(`Recordatorios enviados: ${recordatoriosEnviados}`);
            return recordatoriosEnviados;
        } catch (error) {
            console.error('Error enviando recordatorios:', error);
            throw error;
        }
    }

    /**
     * Genera mensaje de recordatorio según días restantes
     * @param {Object} cuota 
     * @returns {string}
     */
    static generarMensajeRecordatorio(cuota) {
        if (cuota.dias_restantes < 0) {
            const diasVencidos = Math.abs(cuota.dias_restantes);
            return `Su cuota #${cuota.numero_cuota} está vencida hace ${diasVencidos} día(s). Por favor realice el pago para evitar el bloqueo de su cuenta.`;
        } else if (cuota.dias_restantes === 0) {
            return `Hoy debe realizar el pago de la cuota #${cuota.numero_cuota}. Por favor sea puntual con los pagos para no tener inconvenientes.`;
        } else {
            return `Su cuota #${cuota.numero_cuota} vence en ${cuota.dias_restantes} día(s). Por favor sea puntual con los pagos para no tener inconvenientes.`;
        }
    }

    /**
     * Bloquea cuentas con 2 o más cuotas vencidas
     */
    static async blockAccountsWithOverduePayments() {
        try {
            console.log('\n=== BLOQUEANDO CUENTAS CON PAGOS VENCIDOS ===');

            const estudiantes = await this.getEstudiantesConCuotasVencidas();
            let cuentasBloqueadas = 0;

            for (const estudiante of estudiantes) {
                // Bloquear si tiene 2 o más cuotas vencidas y no está bloqueado
                if (estudiante.cuotas_vencidas >= 2 && !estudiante.cuenta_bloqueada) {
                    const motivo = `Falta de pago - ${estudiante.cuotas_vencidas} cuotas vencidas`;

                    await pool.execute(`
            UPDATE usuarios 
            SET cuenta_bloqueada = TRUE,
                motivo_bloqueo = ?,
                fecha_bloqueo = NOW()
            WHERE id_usuario = ?
          `, [motivo, estudiante.id_usuario]);

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
                        estudiante.id_usuario,
                        null, // Sistema automático
                        JSON.stringify({
                            accion: 'BLOQUEO_AUTOMATICO',
                            motivo: motivo,
                            cuotas_vencidas: estudiante.cuotas_vencidas,
                            detalle_cuotas: estudiante.detalle_cuotas
                        })
                    ]);

                    // Enviar notificación WebSocket al estudiante
                    emitToUser(estudiante.id_usuario, 'cuenta_bloqueada', {
                        tipo: 'cuenta_bloqueada',
                        motivo: motivo,
                        fecha_bloqueo: new Date(),
                        cuotas_vencidas: estudiante.cuotas_vencidas
                    });

                    // Enviar notificación WebSocket a los administradores
                    emitToRole('admin', 'cuenta_bloqueada', {
                        tipo: 'cuenta_bloqueada',
                        nombre_estudiante: `${estudiante.nombre} ${estudiante.apellido}`,
                        motivo: motivo,
                        fecha_bloqueo: new Date()
                    });

                    // Enviar email de notificación
                    try {
                        await emailService.sendEmail(
                            estudiante.email,
                            'Cuenta Bloqueada - SGA Belleza',
                            `
                <h2>Cuenta Bloqueada</h2>
                <p>Estimado/a ${estudiante.nombre} ${estudiante.apellido},</p>
                <p>Su cuenta ha sido bloqueada debido a falta de pago.</p>
                <p><strong>Motivo:</strong> ${motivo}</p>
                <p><strong>Cuotas vencidas:</strong></p>
                <p>${estudiante.detalle_cuotas.replace(/\|/g, '<br>')}</p>
                <p>Por favor, acérquese a la escuela y póngase en contacto con el área administrativa para regularizar su situación.</p>
                <p>Saludos cordiales,<br>SGA Belleza</p>
              `
                        );
                    } catch (emailError) {
                        console.error('Error enviando email de bloqueo:', emailError);
                    }

                    console.log(`✓ Cuenta bloqueada: ${estudiante.nombre} ${estudiante.apellido} (${estudiante.cuotas_vencidas} cuotas)`);
                    cuentasBloqueadas++;
                }
            }

            console.log(`Total cuentas bloqueadas: ${cuentasBloqueadas}`);
            return cuentasBloqueadas;
        } catch (error) {
            console.error('Error bloqueando cuentas:', error);
            throw error;
        }
    }

    /**
     * Obtiene el estado de pagos de un estudiante
     * @param {number} id_estudiante 
     * @returns {Promise<Object>}
     */
    static async getStudentPaymentStatus(id_estudiante) {
        try {
            const [cuotasVencidas] = await pool.execute(`
        SELECT COUNT(*) as total
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        WHERE m.id_estudiante = ?
          AND pm.estado = 'pendiente'
          AND pm.fecha_vencimiento < CURDATE()
      `, [id_estudiante]);

            const [cuotasPendientes] = await pool.execute(`
        SELECT COUNT(*) as total
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        WHERE m.id_estudiante = ?
          AND pm.estado = 'pendiente'
      `, [id_estudiante]);

            const [usuario] = await pool.execute(`
        SELECT cuenta_bloqueada, motivo_bloqueo, fecha_bloqueo
        FROM usuarios
        WHERE id_usuario = ?
      `, [id_estudiante]);

            return {
                cuotas_vencidas: cuotasVencidas[0].total,
                cuotas_pendientes: cuotasPendientes[0].total,
                cuenta_bloqueada: usuario[0]?.cuenta_bloqueada || false,
                motivo_bloqueo: usuario[0]?.motivo_bloqueo || null,
                fecha_bloqueo: usuario[0]?.fecha_bloqueo || null,
                en_riesgo_bloqueo: cuotasVencidas[0].total >= 1 && cuotasVencidas[0].total < 2
            };
        } catch (error) {
            console.error('Error obteniendo estado de pagos:', error);
            throw error;
        }
    }
}

module.exports = PaymentReminderService;
