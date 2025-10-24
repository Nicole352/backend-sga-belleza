const bcrypt = require('bcryptjs');
const usuariosModel = require('../models/usuarios.model');
const { registrarAuditoria } = require('../utils/auditoria');

// ========================================
// GET /api/usuarios - Lista paginada con filtros
// ========================================
async function getUsuarios(req, res) {
  try {
    const { search = '', rol = 'todos', estado = 'todos', page = 1, limit = 10 } = req.query;

    console.log('Parámetros recibidos:', { search, rol, estado, page, limit });

    const result = await usuariosModel.getAllUsersWithFilters({
      search,
      rol,
      estado,
      page,
      limit
    });

    console.log('Resultado obtenido:', { total: result.total, usuarios: result.usuarios.length });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios',
      error: error.message
    });
  }
}

// ========================================
// GET /api/usuarios/stats - Estadísticas
// ========================================
async function getUsuariosStats(req, res) {
  try {
    const stats = await usuariosModel.getControlUsuariosStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
}

// ========================================
// GET /api/usuarios/:id - Detalle de usuario
// ========================================
async function getUsuarioById(req, res) {
  try {
    const { id } = req.params;
    const { pool } = require('../config/database');

    const usuario = await usuariosModel.getUserById(id);

    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Ocultar password en la respuesta
    delete usuario.password;

    // Si es estudiante, agregar información académica
    if (usuario.nombre_rol === 'estudiante') {
      console.log(`🎓 Estudiante - id_usuario: ${id}`);

      // Contar cursos matriculados
      const [cursosMatriculados] = await pool.query(
        `SELECT COUNT(DISTINCT m.id_curso) as total
         FROM matriculas m
         WHERE m.id_estudiante = ? AND m.estado = 'activa'`,
        [id]
      );

      // Contar pagos completados (pagado o verificado)
      const [pagosCompletados] = await pool.query(
        `SELECT COUNT(*) as total
         FROM pagos_mensuales pm
         INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
         WHERE m.id_estudiante = ? AND pm.estado IN ('pagado', 'verificado')`,
        [id]
      );

      // Contar pagos pendientes
      const [pagosPendientes] = await pool.query(
        `SELECT COUNT(*) as total
         FROM pagos_mensuales pm
         INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
         WHERE m.id_estudiante = ? AND pm.estado = 'pendiente'`,
        [id]
      );

      console.log(`📚 Cursos matriculados:`, cursosMatriculados[0]);
      console.log(`✅ Pagos completados:`, pagosCompletados[0]);
      console.log(`⏳ Pagos pendientes:`, pagosPendientes[0]);

      usuario.cursos_matriculados = cursosMatriculados[0]?.total || 0;
      usuario.pagos_completados = pagosCompletados[0]?.total || 0;
      usuario.pagos_pendientes = pagosPendientes[0]?.total || 0;
    }

    // Si es docente, agregar información académica
    if (usuario.nombre_rol === 'docente') {
      // Obtener id_docente usando el modelo de docentes
      const DocentesModel = require('../models/docentes.model');
      const id_docente = await DocentesModel.getDocenteIdByUserId(id);

      console.log(`🔍 Docente - id_usuario: ${id}, id_docente: ${id_docente}`);

      if (id_docente) {

        // Contar cursos asignados (a través de asignaciones_aulas activas)
        const [cursosAsignados] = await pool.query(
          `SELECT COUNT(DISTINCT aa.id_curso) as total
           FROM asignaciones_aulas aa
           WHERE aa.id_docente = ? AND aa.estado = 'activa'`,
          [id_docente]
        );

        console.log(`📚 Cursos asignados:`, cursosAsignados[0]);

        // Contar estudiantes activos en esos cursos
        const [estudiantesActivos] = await pool.query(
          `SELECT COUNT(DISTINCT ec.id_estudiante) as total
           FROM asignaciones_aulas aa
           JOIN estudiante_curso ec ON ec.id_curso = aa.id_curso
           WHERE aa.id_docente = ? 
           AND aa.estado = 'activa'
           AND ec.estado IN ('inscrito', 'activo')`,
          [id_docente]
        );

        console.log(`👥 Estudiantes activos:`, estudiantesActivos[0]);

        usuario.cursos_asignados = cursosAsignados[0]?.total || 0;
        usuario.estudiantes_activos = estudiantesActivos[0]?.total || 0;
      } else {
        console.log(`❌ No se encontró id_docente para usuario ${id}`);
      }
    }

    res.json({
      success: true,
      usuario
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuario',
      error: error.message
    });
  }
}

// ========================================
// PUT /api/usuarios/:id/estado - Cambiar estado
// ========================================
async function cambiarEstado(req, res) {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    // Validar estado
    if (!['activo', 'inactivo', 'pendiente'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido. Debe ser: activo, inactivo o pendiente'
      });
    }

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Evitar que el admin se desactive a sí mismo
    if (req.user && req.user.id_usuario === parseInt(id) && estado === 'inactivo') {
      return res.status(400).json({
        success: false,
        message: 'No puedes desactivar tu propia cuenta'
      });
    }

    // Cambiar estado
    const estadoAnterior = usuario.estado;
    const usuarioActualizado = await usuariosModel.changeUserStatus(id, estado);

    // Registrar auditoría - Cambio de estado
    await registrarAuditoria(
      'usuarios',
      'UPDATE',
      parseInt(id),
      req.user?.id_usuario || parseInt(id),
      { estado: estadoAnterior },
      { estado: estado },
      req
    );

    res.json({
      success: true,
      message: `Usuario ${estado === 'activo' ? 'activado' : 'desactivado'} correctamente`,
      usuario: {
        id_usuario: usuarioActualizado.id_usuario,
        nombre: usuarioActualizado.nombre,
        apellido: usuarioActualizado.apellido,
        estado: usuarioActualizado.estado
      }
    });
  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado del usuario',
      error: error.message
    });
  }
}

// ========================================
// POST /api/usuarios/:id/reset-password - Resetear contraseña
// ========================================
async function resetPassword(req, res) {
  try {
    const { id } = req.params;

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Generar nueva contraseña temporal (cédula del usuario)
    const nuevaPasswordTemporal = usuario.cedula;

    // Hashear la nueva contraseña
    const passwordHash = await bcrypt.hash(nuevaPasswordTemporal, 10);

    // Actualizar en la base de datos
    await usuariosModel.resetUserPassword(id, nuevaPasswordTemporal, passwordHash);

    // Registrar auditoría - Reset de contraseña
    await registrarAuditoria(
      'usuarios',
      'UPDATE',
      parseInt(id),
      req.user?.id_usuario || parseInt(id),
      null,
      { accion: 'reset_password', needs_password_reset: true },
      req
    );

    res.json({
      success: true,
      message: 'Contraseña reseteada correctamente',
      credenciales: {
        username: usuario.username || usuario.email,
        password_temporal: nuevaPasswordTemporal,
        mensaje: 'El usuario deberá cambiar esta contraseña en su primer inicio de sesión'
      }
    });
  } catch (error) {
    console.error('Error al resetear contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al resetear contraseña',
      error: error.message
    });
  }
}

// ========================================
// GET /api/usuarios/:id/sesiones - Últimas sesiones
// ========================================
async function getSesiones(req, res) {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    const { pool } = require('../config/database');

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Obtener sesiones de la tabla sesiones_usuario
    const [sesiones] = await pool.query(
      `SELECT id_sesion, ip_address, user_agent, fecha_inicio, fecha_expiracion, fecha_cierre, activa
       FROM sesiones_usuario
       WHERE id_usuario = ?
       ORDER BY fecha_inicio DESC
       LIMIT ?`,
      [id, parseInt(limit)]
    );

    res.json({
      success: true,
      sesiones
    });
  } catch (error) {
    console.error('Error al obtener sesiones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener sesiones',
      error: error.message
    });
  }
}

// ========================================
// GET /api/usuarios/:id/acciones - Últimas acciones con descripciones legibles
// ========================================
async function getAcciones(req, res) {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;
    const { pool } = require('../config/database');

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Obtener acciones de la tabla auditoria_sistema
    // Incluye acciones donde el usuario es quien realiza la acción O donde es el afectado (ej: cambio de contraseña)
    const [acciones] = await pool.query(
      `SELECT id_auditoria, tabla_afectada, operacion, id_registro, ip_address, fecha_operacion, datos_nuevos
       FROM auditoria_sistema
       WHERE usuario_id = ? OR (tabla_afectada = 'usuarios' AND id_registro = ?)
       ORDER BY fecha_operacion DESC
       LIMIT ?`,
      [id, id, parseInt(limit)]
    );

    // Generar descripciones legibles para cada acción
    const accionesConDescripcion = await Promise.all(acciones.map(async (accion) => {
      let descripcion = '';
      let detalles = '';

      try {
        switch (accion.tabla_afectada) {
          // ========== ENTREGAS DE TAREAS ==========
          case 'entregas_tareas':
            if (accion.operacion === 'INSERT') {
              const [tarea] = await pool.query(`
                SELECT t.titulo, m.nombre as modulo, c.nombre as curso
                FROM entregas_tareas et
                JOIN tareas_modulo t ON et.id_tarea = t.id_tarea
                JOIN modulos_curso m ON t.id_modulo = m.id_modulo
                JOIN cursos c ON m.id_curso = c.id_curso
                WHERE et.id_entrega = ?
              `, [accion.id_registro]);
              if (tarea.length > 0) {
                descripcion = `Subió tarea "${tarea[0].titulo}"`;
                detalles = `Módulo: ${tarea[0].modulo} - Curso: ${tarea[0].curso}`;
              } else {
                descripcion = 'Subió una tarea';
              }
            }
            break;

          // ========== MÓDULOS ==========
          case 'modulos_curso':
            if (accion.operacion === 'INSERT') {
              const [modulo] = await pool.query(`
                SELECT m.nombre, c.nombre as curso
                FROM modulos_curso m
                JOIN cursos c ON m.id_curso = c.id_curso
                WHERE m.id_modulo = ?
              `, [accion.id_registro]);
              if (modulo.length > 0) {
                descripcion = `Creó módulo "${modulo[0].nombre}"`;
                detalles = `En el curso: ${modulo[0].curso}`;
              } else {
                descripcion = 'Creó un módulo';
                detalles = 'Nuevo módulo académico';
              }
            } else if (accion.operacion === 'DELETE') {
              descripcion = 'Eliminó un módulo';
              detalles = 'Módulo académico eliminado';
            } else if (accion.operacion === 'UPDATE') {
              descripcion = 'Actualizó un módulo';
              detalles = 'Modificación de módulo académico';
            }
            break;

          // ========== TAREAS ==========
          case 'tareas_modulo':
            if (accion.operacion === 'INSERT') {
              const [tarea] = await pool.query(`
                SELECT t.titulo, m.nombre as modulo
                FROM tareas_modulo t
                JOIN modulos_curso m ON t.id_modulo = m.id_modulo
                WHERE t.id_tarea = ?
              `, [accion.id_registro]);
              if (tarea.length > 0) {
                descripcion = `Creó tarea "${tarea[0].titulo}"`;
                detalles = `En el módulo: ${tarea[0].modulo}`;
              } else {
                descripcion = 'Creó una tarea';
                detalles = 'Nueva tarea para estudiantes';
              }
            } else if (accion.operacion === 'DELETE') {
              descripcion = 'Eliminó una tarea';
              detalles = 'Tarea eliminada del módulo';
            } else if (accion.operacion === 'UPDATE') {
              descripcion = 'Actualizó una tarea';
              detalles = 'Modificación de tarea existente';
            }
            break;

          // ========== CALIFICACIONES ==========
          case 'calificaciones_tareas':
            if (accion.operacion === 'INSERT') {
              const [calif] = await pool.query(`
                SELECT c.nota, t.titulo, u.nombre, u.apellido
                FROM calificaciones_tareas c
                JOIN entregas_tareas et ON c.id_entrega = et.id_entrega
                JOIN tareas_modulo t ON et.id_tarea = t.id_tarea
                JOIN usuarios u ON et.id_estudiante = u.id_usuario
                WHERE c.id_calificacion = ?
              `, [accion.id_registro]);
              if (calif.length > 0) {
                descripcion = `Calificó tarea de ${calif[0].nombre} ${calif[0].apellido}`;
                detalles = `Nota: ${calif[0].nota}/20 - Tarea: "${calif[0].titulo}"`;
              } else {
                descripcion = 'Calificó una tarea';
                detalles = 'Evaluación de estudiante';
              }
            }
            break;

          // ========== USUARIOS ==========
          case 'usuarios':
            if (accion.operacion === 'INSERT') {
              const [user] = await pool.query(`
                SELECT nombre, apellido, username, email FROM usuarios WHERE id_usuario = ?
              `, [accion.id_registro]);
              if (user.length > 0) {
                descripcion = `Creó usuario ${user[0].nombre} ${user[0].apellido}`;
                detalles = `Username: ${user[0].username || user[0].email || 'No especificado'}`;
              } else {
                descripcion = 'Creó un usuario';
                detalles = 'Nuevo usuario en el sistema';
              }
            } else if (accion.operacion === 'UPDATE') {
              // Verificar si es cambio de contraseña
              let datosNuevos = {};
              if (accion.datos_nuevos) {
                try {
                  datosNuevos = typeof accion.datos_nuevos === 'string' 
                    ? JSON.parse(accion.datos_nuevos) 
                    : accion.datos_nuevos;
                } catch (err) {
                  console.error('Error parseando datos_nuevos:', err);
                  datosNuevos = {};
                }
              }
              
              // Verificar si es cambio de contraseña
              if (datosNuevos.password_changed) {
                const [user] = await pool.query(`
                  SELECT nombre, apellido, username, email FROM usuarios WHERE id_usuario = ?
                `, [accion.id_registro]);
                
                if (user.length > 0) {
                  if (accion.id_registro === parseInt(id)) {
                    descripcion = 'Cambió su contraseña';
                  } else {
                    descripcion = `${user[0].nombre} ${user[0].apellido} cambió su contraseña`;
                  }
                  detalles = `Usuario: ${user[0].username || user[0].email} - Contraseña actualizada exitosamente`;
                } else {
                  descripcion = 'Cambió su contraseña';
                  detalles = 'Contraseña actualizada exitosamente';
                }
              } else {
                // Actualización general de perfil
                const [user] = await pool.query(`
                  SELECT nombre, apellido FROM usuarios WHERE id_usuario = ?
                `, [accion.id_registro]);
                
                if (accion.id_registro === parseInt(id)) {
                  descripcion = 'Actualizó su perfil';
                  detalles = 'Modificación de información personal';
                } else if (user.length > 0) {
                  descripcion = `Actualizó usuario ${user[0].nombre} ${user[0].apellido}`;
                  detalles = 'Modificación de información del usuario';
                } else {
                  descripcion = 'Actualizó un usuario';
                  detalles = 'Modificación de información';
                }
              }
            }
            break;

          // ========== MATRÍCULAS ==========
          case 'matriculas':
            if (accion.operacion === 'INSERT') {
              const [mat] = await pool.query(`
                SELECT u.nombre, u.apellido, c.nombre as curso
                FROM matriculas m
                JOIN usuarios u ON m.id_estudiante = u.id_usuario
                JOIN cursos c ON m.id_curso = c.id_curso
                WHERE m.id_matricula = ?
              `, [accion.id_registro]);
              if (mat.length > 0) {
                descripcion = `Aprobó matrícula de ${mat[0].nombre} ${mat[0].apellido}`;
                detalles = `Curso: ${mat[0].curso}`;
              } else {
                descripcion = 'Aprobó una matrícula';
              }
            }
            break;

          // ========== PAGOS ==========
          case 'pagos_mensuales':
            if (accion.operacion === 'UPDATE') {
              const [pago] = await pool.query(`
                SELECT u.nombre, u.apellido, pm.numero_cuota, pm.monto
                FROM pagos_mensuales pm
                JOIN matriculas m ON pm.id_matricula = m.id_matricula
                JOIN usuarios u ON m.id_estudiante = u.id_usuario
                WHERE pm.id_pago = ?
              `, [accion.id_registro]);
              if (pago.length > 0) {
                descripcion = `Verificó pago de ${pago[0].nombre} ${pago[0].apellido}`;
                detalles = `Cuota #${pago[0].numero_cuota} - $${pago[0].monto}`;
              } else {
                descripcion = 'Verificó un pago';
              }
            }
            break;

          // ========== ESTUDIANTE_CURSO ==========
          case 'estudiante_curso':
            if (accion.operacion === 'INSERT') {
              const [inscripcion] = await pool.query(`
                SELECT c.nombre as curso
                FROM estudiante_curso ec
                JOIN cursos c ON ec.id_curso = c.id_curso
                WHERE ec.id_inscripcion = ?
              `, [accion.id_registro]);
              if (inscripcion.length > 0) {
                descripcion = `Se inscribió al curso "${inscripcion[0].curso}"`;
              } else {
                descripcion = 'Se inscribió a un curso';
              }
            }
            break;

          // ========== CURSOS ==========
          case 'cursos':
            if (accion.operacion === 'INSERT') {
              const [curso] = await pool.query(`
                SELECT c.nombre, c.horario, tc.nombre as tipo_curso
                FROM cursos c
                JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
                WHERE c.id_curso = ?
              `, [accion.id_registro]);
              if (curso.length > 0) {
                descripcion = `Creó curso "${curso[0].nombre}"`;
                detalles = `Tipo: ${curso[0].tipo_curso} - Horario: ${curso[0].horario}`;
              } else {
                descripcion = 'Creó un curso';
                detalles = 'Nuevo curso académico';
              }
            } else if (accion.operacion === 'UPDATE') {
              const [curso] = await pool.query(`
                SELECT c.nombre FROM cursos c WHERE c.id_curso = ?
              `, [accion.id_registro]);
              if (curso.length > 0) {
                descripcion = `Actualizó curso "${curso[0].nombre}"`;
                detalles = 'Modificación de curso existente';
              } else {
                descripcion = 'Actualizó un curso';
                detalles = 'Modificación de curso';
              }
            } else if (accion.operacion === 'DELETE') {
              descripcion = 'Eliminó un curso';
              detalles = 'Curso eliminado del sistema';
            }
            break;

          // ========== DOCENTES ==========
          case 'docentes':
            if (accion.operacion === 'INSERT') {
              const [docente] = await pool.query(`
                SELECT nombres, apellidos, titulo_profesional
                FROM docentes
                WHERE id_docente = ?
              `, [accion.id_registro]);
              if (docente.length > 0) {
                descripcion = `Registró docente ${docente[0].nombres} ${docente[0].apellidos}`;
                detalles = `Título: ${docente[0].titulo_profesional || 'No especificado'}`;
              } else {
                descripcion = 'Registró un docente';
                detalles = 'Nuevo docente en el sistema';
              }
            } else if (accion.operacion === 'UPDATE') {
              const [docente] = await pool.query(`
                SELECT nombres, apellidos FROM docentes WHERE id_docente = ?
              `, [accion.id_registro]);
              if (docente.length > 0) {
                descripcion = `Actualizó docente ${docente[0].nombres} ${docente[0].apellidos}`;
                detalles = 'Modificación de información del docente';
              } else {
                descripcion = 'Actualizó un docente';
                detalles = 'Modificación de información';
              }
            } else if (accion.operacion === 'DELETE') {
              descripcion = 'Eliminó un docente';
              detalles = 'Docente eliminado del sistema';
            }
            break;

          // ========== DEFAULT ==========
          default:
            descripcion = `${accion.operacion} en ${accion.tabla_afectada}`;
            detalles = `ID: ${accion.id_registro}`;
        }
      } catch (err) {
        console.error('Error generando descripción:', err);
        descripcion = `${accion.operacion} en ${accion.tabla_afectada}`;
        detalles = `ID: ${accion.id_registro}`;
      }

      return {
        id_auditoria: accion.id_auditoria,
        tabla_afectada: accion.tabla_afectada,
        operacion: accion.operacion,
        id_registro: accion.id_registro,
        descripcion,
        detalles,
        ip_address: accion.ip_address,
        fecha_operacion: accion.fecha_operacion
      };
    }));

    res.json({
      success: true,
      acciones: accionesConDescripcion
    });
  } catch (error) {
    console.error('Error al obtener acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener acciones',
      error: error.message
    });
  }
}

// ========================================
// PUT /api/usuarios/:id/foto-perfil - Subir foto de perfil
// ========================================
async function subirFotoPerfil(req, res) {
  try {
    const { id } = req.params;

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Verificar que se subió un archivo
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }

    // Validar que el usuario solo puede cambiar su propia foto (o ser admin)
    if (req.user && req.user.id_usuario !== parseInt(id) && req.user.nombre_rol !== 'administrativo') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para cambiar la foto de este usuario'
      });
    }

    // Guardar la foto en la base de datos (BLOB)
    const fotoBuffer = req.file.buffer;
    await usuariosModel.updateFotoPerfil(id, fotoBuffer);

    // Registrar auditoría
    await registrarAuditoria(
      'usuarios',
      'UPDATE',
      parseInt(id),
      req.user?.id_usuario || parseInt(id),
      null,
      { accion: 'actualizar_foto_perfil' },
      req
    );

    res.json({
      success: true,
      message: 'Foto de perfil actualizada correctamente',
      data: {
        id_usuario: parseInt(id),
        foto_actualizada: true,
        tamano_kb: Math.round(req.file.size / 1024)
      }
    });
  } catch (error) {
    console.error('Error al subir foto de perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error al subir foto de perfil',
      error: error.message
    });
  }
}

// ========================================
// GET /api/usuarios/:id/foto-perfil - Obtener foto de perfil
// ========================================
async function obtenerFotoPerfil(req, res) {
  try {
    const { id } = req.params;

    // Obtener la foto desde la base de datos
    const fotoBuffer = await usuariosModel.getFotoPerfil(id);

    if (!fotoBuffer) {
      return res.status(404).json({
        success: false,
        message: 'El usuario no tiene foto de perfil'
      });
    }

    // Enviar la imagen como respuesta
    res.set('Content-Type', 'image/jpeg'); // Asumimos JPEG por defecto
    res.set('Cache-Control', 'public, max-age=86400'); // Cache de 1 día
    res.send(fotoBuffer);
  } catch (error) {
    console.error('Error al obtener foto de perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener foto de perfil',
      error: error.message
    });
  }
}

// ========================================
// DELETE /api/usuarios/:id/foto-perfil - Eliminar foto de perfil
// ========================================
async function eliminarFotoPerfil(req, res) {
  try {
    const { id } = req.params;

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Validar que el usuario solo puede eliminar su propia foto (o ser admin)
    if (req.user && req.user.id_usuario !== parseInt(id) && req.user.nombre_rol !== 'administrativo') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para eliminar la foto de este usuario'
      });
    }

    // Eliminar la foto de la base de datos
    await usuariosModel.deleteFotoPerfil(id);

    // Registrar auditoría
    await registrarAuditoria(
      'usuarios',
      'UPDATE',
      parseInt(id),
      req.user?.id_usuario || parseInt(id),
      null,
      { accion: 'eliminar_foto_perfil' },
      req
    );

    res.json({
      success: true,
      message: 'Foto de perfil eliminada correctamente'
    });
  } catch (error) {
    console.error('Error al eliminar foto de perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar foto de perfil',
      error: error.message
    });
  }
}

// ========================================
// PUT /api/usuarios/mi-perfil - Actualizar perfil propio
// ========================================
async function actualizarMiPerfil(req, res) {
  try {
    const id_usuario = req.user.id_usuario; // Del token JWT
    const { nombre, apellido, email, telefono, direccion, fecha_nacimiento, genero } = req.body;

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id_usuario);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Si está cambiando el email, verificar que no esté en uso
    if (email && email !== usuario.email) {
      const emailExistente = await usuariosModel.getUserByEmail(email);
      if (emailExistente && emailExistente.id_usuario !== id_usuario) {
        return res.status(400).json({
          success: false,
          message: 'El email ya está en uso por otro usuario'
        });
      }
    }

    // Preparar campos a actualizar
    const camposActualizar = {};
    if (nombre !== undefined) camposActualizar.nombre = nombre;
    if (apellido !== undefined) camposActualizar.apellido = apellido;
    if (email !== undefined) camposActualizar.email = email;
    if (telefono !== undefined) camposActualizar.telefono = telefono;
    if (direccion !== undefined) camposActualizar.direccion = direccion;
    if (fecha_nacimiento !== undefined) camposActualizar.fecha_nacimiento = fecha_nacimiento;
    if (genero !== undefined) camposActualizar.genero = genero;

    // Datos anteriores para auditoría
    const datosAnteriores = {
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      telefono: usuario.telefono,
      direccion: usuario.direccion,
      fecha_nacimiento: usuario.fecha_nacimiento,
      genero: usuario.genero
    };

    // Actualizar en la base de datos
    const usuarioActualizado = await usuariosModel.updateAdminUser(id_usuario, camposActualizar);

    // Registrar auditoría
    await registrarAuditoria(
      'usuarios',
      'UPDATE',
      id_usuario,
      id_usuario,
      datosAnteriores,
      camposActualizar,
      req
    );

    // Ocultar password en la respuesta
    delete usuarioActualizado.password;
    delete usuarioActualizado.password_temporal;

    res.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      usuario: usuarioActualizado
    });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar perfil',
      error: error.message
    });
  }
}

// ========================================
// PUT /api/usuarios/cambiar-password - Cambiar contraseña propia
// ========================================
async function cambiarMiPassword(req, res) {
  try {
    const id_usuario = req.user.id_usuario; // Del token JWT
    const { password_actual, password_nueva } = req.body;

    // Validar que se envíen ambas contraseñas
    if (!password_actual || !password_nueva) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar la contraseña actual y la nueva contraseña'
      });
    }

    // Validar longitud de la nueva contraseña
    if (password_nueva.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe tener al menos 8 caracteres'
      });
    }

    // Obtener usuario con contraseña
    const usuario = await usuariosModel.getUserById(id_usuario);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Verificar contraseña actual
    const passwordValida = await bcrypt.compare(password_actual, usuario.password);
    if (!passwordValida) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña actual es incorrecta'
      });
    }

    // Hashear la nueva contraseña
    const passwordHash = await bcrypt.hash(password_nueva, 10);

    // Actualizar contraseña
    await usuariosModel.updateUserPassword(id_usuario, passwordHash);

    // Registrar auditoría
    await registrarAuditoria(
      'usuarios',
      'UPDATE',
      id_usuario,
      id_usuario,
      null,
      { accion: 'cambio_password' },
      req
    );

    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar contraseña',
      error: error.message
    });
  }
}

module.exports = {
  getUsuarios,
  getUsuariosStats,
  getUsuarioById,
  cambiarEstado,
  resetPassword,
  getSesiones,
  getAcciones,
  // Funciones para foto de perfil
  subirFotoPerfil,
  obtenerFotoPerfil,
  eliminarFotoPerfil,
  // Funciones para perfil propio
  actualizarMiPerfil,
  cambiarMiPassword
};
