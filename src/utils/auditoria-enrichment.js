const { pool } = require('../config/database');

/**
 * Enriquece los datos de auditoría con información contextual adicional
 * para generar descripciones más útiles y detalladas
 * 
 * @param {string} tabla - Nombre de la tabla afectada
 * @param {string} operacion - INSERT, UPDATE o DELETE
 * @param {number} idRegistro - ID del registro afectado
 * @param {object} datosNuevos - Datos nuevos del registro
 * @param {object} datosAnteriores - Datos anteriores del registro
 * @returns {object} Objeto con datos_nuevos y datos_anteriores enriquecidos
 */
async function enriquecerDatosAuditoria(tabla, operacion, idRegistro, datosNuevos = {}, datosAnteriores = {}) {
    try {
        let nuevosEnriquecidos = { ...datosNuevos };
        let anterioresEnriquecidos = { ...datosAnteriores };

        switch (tabla) {
            case 'usuarios':
                // Obtener información del usuario afectado
                if (idRegistro) {
                    const [usuario] = await pool.execute(
                        `SELECT u.nombre, u.apellido, u.cedula, u.email, r.nombre_rol 
             FROM usuarios u 
             LEFT JOIN roles r ON u.id_rol = r.id_rol 
             WHERE u.id_usuario = ?`,
                        [idRegistro]
                    );

                    if (usuario.length > 0) {
                        nuevosEnriquecidos = {
                            ...nuevosEnriquecidos,
                            nombre: nuevosEnriquecidos.nombre || usuario[0].nombre,
                            apellido: nuevosEnriquecidos.apellido || usuario[0].apellido,
                            cedula: nuevosEnriquecidos.cedula || usuario[0].cedula,
                            email: nuevosEnriquecidos.email || usuario[0].email,
                            rol: nuevosEnriquecidos.rol || usuario[0].nombre_rol
                        };
                    }
                }
                break;

            case 'solicitudes_matricula':
                // Obtener información de la solicitud
                if (idRegistro) {
                    const [solicitud] = await pool.execute(
                        `SELECT codigo_solicitud, nombre_solicitante, apellido_solicitante, 
                    email_solicitante, estado, horario_preferido
             FROM solicitudes_matricula 
             WHERE id_solicitud = ?`,
                        [idRegistro]
                    );

                    if (solicitud.length > 0) {
                        nuevosEnriquecidos = {
                            ...nuevosEnriquecidos,
                            codigo_solicitud: nuevosEnriquecidos.codigo_solicitud || solicitud[0].codigo_solicitud,
                            nombre_solicitante: nuevosEnriquecidos.nombre_solicitante || solicitud[0].nombre_solicitante,
                            apellido_solicitante: nuevosEnriquecidos.apellido_solicitante || solicitud[0].apellido_solicitante,
                            email_solicitante: nuevosEnriquecidos.email_solicitante || solicitud[0].email_solicitante
                        };

                        // Para operaciones UPDATE, guardar el estado anterior si no existe
                        if (operacion === 'UPDATE' && !anterioresEnriquecidos.estado) {
                            anterioresEnriquecidos.estado = solicitud[0].estado;
                        }
                    }
                }
                break;

            case 'pagos_mensuales':
                // Obtener información del pago con datos del estudiante y curso
                if (idRegistro) {
                    const [pago] = await pool.execute(
                        `SELECT pm.numero_cuota, pm.monto, pm.estado, pm.metodo_pago,
                    u.nombre as estudiante_nombre, u.apellido as estudiante_apellido,
                    c.nombre as nombre_curso
             FROM pagos_mensuales pm
             INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
             INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
             INNER JOIN cursos c ON m.id_curso = c.id_curso
             WHERE pm.id_pago = ?`,
                        [idRegistro]
                    );

                    if (pago.length > 0) {
                        nuevosEnriquecidos = {
                            ...nuevosEnriquecidos,
                            numero_cuota: nuevosEnriquecidos.numero_cuota || pago[0].numero_cuota,
                            monto: nuevosEnriquecidos.monto || pago[0].monto,
                            estudiante_nombre: pago[0].estudiante_nombre,
                            estudiante_apellido: pago[0].estudiante_apellido,
                            nombre_curso: pago[0].nombre_curso
                        };

                        if (operacion === 'UPDATE' && !anterioresEnriquecidos.estado) {
                            anterioresEnriquecidos.estado = pago[0].estado;
                        }
                    }
                }
                break;

            case 'cursos':
                // Obtener información del curso
                if (idRegistro) {
                    const [curso] = await pool.execute(
                        `SELECT c.nombre, c.codigo_curso, c.horario, c.estado,
                    tc.nombre as tipo_curso
             FROM cursos c
             LEFT JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
             WHERE c.id_curso = ?`,
                        [idRegistro]
                    );

                    if (curso.length > 0) {
                        nuevosEnriquecidos = {
                            ...nuevosEnriquecidos,
                            nombre: nuevosEnriquecidos.nombre || curso[0].nombre,
                            codigo_curso: nuevosEnriquecidos.codigo_curso || curso[0].codigo_curso,
                            horario: nuevosEnriquecidos.horario || curso[0].horario
                        };
                    }
                }
                break;

            case 'matriculas':
                // Obtener información de la matrícula
                if (idRegistro) {
                    const [matricula] = await pool.execute(
                        `SELECT m.codigo_matricula, m.monto_matricula, m.estado,
                    u.nombre as estudiante_nombre, u.apellido as estudiante_apellido,
                    c.nombre as nombre_curso
             FROM matriculas m
             INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
             INNER JOIN cursos c ON m.id_curso = c.id_curso
             WHERE m.id_matricula = ?`,
                        [idRegistro]
                    );

                    if (matricula.length > 0) {
                        nuevosEnriquecidos = {
                            ...nuevosEnriquecidos,
                            codigo_matricula: nuevosEnriquecidos.codigo_matricula || matricula[0].codigo_matricula,
                            monto_matricula: nuevosEnriquecidos.monto_matricula || matricula[0].monto_matricula,
                            estudiante_nombre: matricula[0].estudiante_nombre,
                            estudiante_apellido: matricula[0].estudiante_apellido,
                            nombre_curso: matricula[0].nombre_curso
                        };
                    }
                }
                break;

            case 'docentes':
                // Obtener información del docente
                if (idRegistro) {
                    const [docente] = await pool.execute(
                        `SELECT nombres, apellidos, identificacion, titulo_profesional, estado
             FROM docentes
             WHERE id_docente = ?`,
                        [idRegistro]
                    );

                    if (docente.length > 0) {
                        nuevosEnriquecidos = {
                            ...nuevosEnriquecidos,
                            nombres: nuevosEnriquecidos.nombres || docente[0].nombres,
                            apellidos: nuevosEnriquecidos.apellidos || docente[0].apellidos,
                            identificacion: nuevosEnriquecidos.identificacion || docente[0].identificacion
                        };
                    }
                }
                break;

            case 'modulos_curso':
                // Obtener información del módulo
                if (idRegistro) {
                    const [modulo] = await pool.execute(
                        `SELECT m.nombre, m.descripcion, m.estado,
                    c.nombre as nombre_curso
             FROM modulos_curso m
             INNER JOIN cursos c ON m.id_curso = c.id_curso
             WHERE m.id_modulo = ?`,
                        [idRegistro]
                    );

                    if (modulo.length > 0) {
                        nuevosEnriquecidos = {
                            ...nuevosEnriquecidos,
                            nombre: nuevosEnriquecidos.nombre || modulo[0].nombre,
                            nombre_curso: modulo[0].nombre_curso
                        };
                    }
                }
                break;

            case 'tareas_modulo':
                // Obtener información de la tarea
                if (idRegistro) {
                    const [tarea] = await pool.execute(
                        `SELECT t.titulo, t.descripcion, t.nota_maxima, t.fecha_limite,
                    m.nombre as nombre_modulo,
                    c.nombre as nombre_curso
             FROM tareas_modulo t
             INNER JOIN modulos_curso m ON t.id_modulo = m.id_modulo
             INNER JOIN cursos c ON m.id_curso = c.id_curso
             WHERE t.id_tarea = ?`,
                        [idRegistro]
                    );

                    if (tarea.length > 0) {
                        nuevosEnriquecidos = {
                            ...nuevosEnriquecidos,
                            titulo: nuevosEnriquecidos.titulo || tarea[0].titulo,
                            nombre_modulo: tarea[0].nombre_modulo,
                            nombre_curso: tarea[0].nombre_curso
                        };
                    }
                }
                break;

            case 'asistencias':
                // Obtener información de la asistencia
                if (idRegistro) {
                    const [asistencia] = await pool.execute(
                        `SELECT a.fecha, a.estado,
                    u.nombre as estudiante_nombre, u.apellido as estudiante_apellido,
                    c.nombre as nombre_curso
             FROM asistencias a
             INNER JOIN usuarios u ON a.id_estudiante = u.id_usuario
             INNER JOIN cursos c ON a.id_curso = c.id_curso
             WHERE a.id_asistencia = ?`,
                        [idRegistro]
                    );

                    if (asistencia.length > 0) {
                        nuevosEnriquecidos = {
                            ...nuevosEnriquecidos,
                            fecha: nuevosEnriquecidos.fecha || asistencia[0].fecha,
                            estudiante_nombre: asistencia[0].estudiante_nombre,
                            estudiante_apellido: asistencia[0].estudiante_apellido,
                            nombre_curso: asistencia[0].nombre_curso
                        };
                    }
                }
                break;

            // Agregar más casos según sea necesario
            default:
                // Para tablas no especificadas, no hacer enriquecimiento adicional
                break;
        }

        return {
            datos_nuevos: nuevosEnriquecidos,
            datos_anteriores: anterioresEnriquecidos
        };

    } catch (error) {
        console.error('Error al enriquecer datos de auditoría:', error);
        // En caso de error, devolver los datos originales
        return {
            datos_nuevos: datosNuevos,
            datos_anteriores: datosAnteriores
        };
    }
}

module.exports = { enriquecerDatosAuditoria };
