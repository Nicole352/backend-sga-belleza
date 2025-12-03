const auditoriaModel = require('../models/auditoria.model');
const { pool } = require('../config/database');

/**
 * Obtener lista paginada de auditorías con filtros
 */
async function listarAuditorias(req, res) {
  try {
    const filtros = {
      pagina: parseInt(req.query.pagina) || 1,
      limite: parseInt(req.query.limite) || 20,
      usuario_id: req.query.usuario_id,
      tabla: req.query.tabla,
      operacion: req.query.operacion,
      fecha_inicio: req.query.fecha_inicio,
      fecha_fin: req.query.fecha_fin,
      id_registro: req.query.id_registro,
      busqueda: req.query.busqueda
    };

    const resultado = await auditoriaModel.obtenerAuditorias(filtros);

    res.json({
      success: true,
      data: resultado
    });
  } catch (error) {
    console.error('Error en listarAuditorias:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener auditorías',
      error: error.message
    });
  }
}

/**
 * Obtener detalle de auditoría específica
 */
async function obtenerDetalleAuditoria(req, res) {
  try {
    const { id } = req.params;
    const auditoria = await auditoriaModel.obtenerAuditoriaPorId(id);

    if (!auditoria) {
      return res.status(404).json({
        success: false,
        message: 'Auditoría no encontrada'
      });
    }

    res.json({
      success: true,
      data: auditoria
    });
  } catch (error) {
    console.error('Error en obtenerDetalleAuditoria:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener detalle de auditoría',
      error: error.message
    });
  }
}

/**
 * Obtener auditorías de un usuario específico
 */
async function obtenerAuditoriasPorUsuario(req, res) {
  try {
    const { userId } = req.params;
    const limite = parseInt(req.query.limite) || 50;

    const auditorias = await auditoriaModel.obtenerAuditoriasPorUsuario(userId, limite);

    res.json({
      success: true,
      data: auditorias
    });
  } catch (error) {
    console.error('Error en obtenerAuditoriasPorUsuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener auditorías del usuario',
      error: error.message
    });
  }
}

/**
 * Obtener auditorías de una tabla específica
 */
async function obtenerAuditoriasPorTabla(req, res) {
  try {
    const { tabla } = req.params;
    const limite = parseInt(req.query.limite) || 50;

    const auditorias = await auditoriaModel.obtenerAuditoriasPorTabla(tabla, limite);

    res.json({
      success: true,
      data: auditorias
    });
  } catch (error) {
    console.error('Error en obtenerAuditoriasPorTabla:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener auditorías de la tabla',
      error: error.message
    });
  }
}

/**
 * Obtener estadísticas de auditoría
 */
async function obtenerEstadisticas(req, res) {
  try {
    const estadisticas = await auditoriaModel.obtenerEstadisticas();

    res.json({
      success: true,
      data: estadisticas
    });
  } catch (error) {
    console.error('Error en obtenerEstadisticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
}

/**
 * Obtener tablas únicas
 */
async function obtenerTablasUnicas(req, res) {
  try {
    const tablas = await auditoriaModel.obtenerTablasUnicas();

    res.json({
      success: true,
      data: tablas
    });
  } catch (error) {
    console.error('Error en obtenerTablasUnicas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tablas',
      error: error.message
    });
  }
}

/**
 * Obtener historial detallado de acciones de un usuario
 * Incluye información específica según el rol (estudiante o docente)
 */
async function obtenerHistorialDetallado(req, res) {
  try {
    const { userId } = req.params;
    const { tipo } = req.query; // 'administrativas' o 'academicas'
    const limite = parseInt(req.query.limite) || 50;

    // Obtener rol del usuario y datos adicionales
    const [usuario] = await pool.execute(
      'SELECT u.id_usuario, u.cedula, u.id_rol, r.nombre_rol FROM usuarios u INNER JOIN roles r ON u.id_rol = r.id_rol WHERE u.id_usuario = ?',
      [userId]
    );

    if (usuario.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const rol = usuario[0].nombre_rol.toLowerCase();
    let acciones = [];

    console.log('Debug - userId:', userId, 'tipo:', tipo, 'limite:', limite, 'rol:', rol);

    // Si es docente, obtener su id_docente
    let idDocente = null;
    if (rol === 'docente') {
      const [docente] = await pool.execute(
        'SELECT id_docente FROM docentes WHERE identificacion = ?',
        [usuario[0].cedula]
      );
      if (docente.length > 0) {
        idDocente = docente[0].id_docente;
      }
    }

    // PARA ESTUDIANTES
    if (rol === 'estudiante') {
      if (tipo === 'administrativas' || tipo === 'todas' || !tipo) {
        console.log('Ejecutando queries administrativas separadas para userId:', userId);

        // Query 1: Cambios de perfil
        const [cambiosPerfil] = await pool.execute(`
          SELECT 
            'cambio_perfil' as tipo_accion,
            CONCAT('Actualización de perfil') as descripcion,
            a.datos_nuevos,
            a.datos_anteriores,
            a.fecha_operacion as fecha_hora,
            a.ip_address
          FROM auditoria_sistema a
          WHERE a.usuario_id = ?
            AND a.tabla_afectada = 'usuarios'
            AND a.operacion = 'UPDATE'
          ORDER BY a.fecha_operacion DESC
          LIMIT 25
        `, [Number(userId)]);

        // Formatear cambios de perfil con detalles útiles
        const cambiosFormateados = cambiosPerfil.map(cambio => {
          let detalles = {};

          try {
            const datosNuevos = JSON.parse(cambio.datos_nuevos || '{}');
            const datosAnteriores = JSON.parse(cambio.datos_anteriores || '{}');

            // Detectar qué cambió específicamente
            if (datosNuevos.password_changed || datosNuevos.password) {
              detalles.cambio_realizado = 'Contraseña actualizada';
              detalles.tipo = 'Seguridad';
            } else if (datosNuevos.foto_perfil !== undefined) {
              detalles.cambio_realizado = 'Foto de perfil actualizada';
              detalles.tipo = 'Perfil';
            } else {
              // Otros cambios
              const camposModificados = [];

              if (datosNuevos.nombre && datosNuevos.nombre !== datosAnteriores.nombre) {
                camposModificados.push('Nombre');
              }
              if (datosNuevos.apellido && datosNuevos.apellido !== datosAnteriores.apellido) {
                camposModificados.push('Apellido');
              }
              if (datosNuevos.email && datosNuevos.email !== datosAnteriores.email) {
                camposModificados.push('Email');
                detalles.email_anterior = datosAnteriores.email;
                detalles.email_nuevo = datosNuevos.email;
              }
              if (datosNuevos.telefono && datosNuevos.telefono !== datosAnteriores.telefono) {
                camposModificados.push('Teléfono');
                detalles.telefono_anterior = datosAnteriores.telefono;
                detalles.telefono_nuevo = datosNuevos.telefono;
              }
              if (datosNuevos.direccion && datosNuevos.direccion !== datosAnteriores.direccion) {
                camposModificados.push('Dirección');
              }

              if (camposModificados.length > 0) {
                detalles.cambio_realizado = `Actualización de ${camposModificados.join(', ')}`;
                detalles.tipo = 'Información Personal';
              } else {
                detalles.cambio_realizado = 'Actualización de perfil';
                detalles.tipo = 'General';
              }
            }
          } catch (e) {
            detalles.cambio_realizado = 'Actualización de perfil';
            detalles.tipo = 'Sistema';
          }

          return {
            tipo_accion: cambio.tipo_accion,
            descripcion: cambio.descripcion,
            detalles: JSON.stringify(detalles),
            fecha_hora: cambio.fecha_hora,
            ip_address: cambio.ip_address
          };
        });

        // Query 2: Pagos
        const [pagos] = await pool.execute(`
          SELECT 
            'pago' as tipo_accion,
            CONCAT('Pago de cuota #', pm.numero_cuota, ' - ', c.nombre) as descripcion,
            c.nombre as curso,
            c.codigo_curso,
            pm.numero_cuota as cuota,
            pm.monto,
            pm.metodo_pago,
            pm.estado,
            pm.fecha_pago,
            pm.fecha_verificacion,
            pm.fecha_vencimiento,
            pm.numero_comprobante,
            pm.banco_comprobante,
            COALESCE(pm.fecha_verificacion, pm.fecha_pago) as fecha_hora,
            NULL as ip_address
          FROM pagos_mensuales pm
          INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
          INNER JOIN cursos c ON m.id_curso = c.id_curso
          WHERE m.id_estudiante = ?
            AND pm.estado IN ('pagado', 'verificado')
          ORDER BY fecha_hora DESC
          LIMIT 25
        `, [Number(userId)]);

        // Formatear pagos con JSON
        const pagosFormateados = pagos.map(p => ({
          tipo_accion: p.tipo_accion,
          descripcion: p.descripcion,
          detalles: JSON.stringify({
            curso: p.curso,
            codigo_curso: p.codigo_curso,
            cuota: p.cuota,
            monto: p.monto,
            metodo_pago: p.metodo_pago,
            estado: p.estado,
            fecha_pago: p.fecha_pago,
            fecha_verificacion: p.fecha_verificacion,
            fecha_vencimiento: p.fecha_vencimiento,
            numero_comprobante: p.numero_comprobante,
            banco_comprobante: p.banco_comprobante
          }),
          fecha_hora: p.fecha_hora,
          ip_address: p.ip_address
        }));

        // Combinar resultados
        acciones = [...acciones, ...cambiosFormateados, ...pagosFormateados];
      }

      if (tipo === 'academicas' || tipo === 'todas' || !tipo) {
        console.log('Ejecutando queries académicas separadas para userId:', userId);

        // Query 1: Tareas subidas
        const [tareasSubidas] = await pool.execute(`
          SELECT 
            'tarea_subida' as tipo_accion,
            CONCAT('Tarea subida: "', t.titulo, '" - ', m_mod.nombre) as descripcion,
            t.titulo as tarea,
            m_mod.nombre as modulo,
            c.nombre as curso,
            e.fecha_entrega,
            e.estado,
            e.archivo_url,
            e.archivo_public_id,
            e.fecha_entrega as fecha_hora,
            NULL as ip_address
          FROM entregas_tareas e
          INNER JOIN tareas_modulo t ON e.id_tarea = t.id_tarea
          INNER JOIN modulos_curso m_mod ON t.id_modulo = m_mod.id_modulo
          INNER JOIN cursos c ON m_mod.id_curso = c.id_curso
          WHERE e.id_estudiante = ?
          ORDER BY e.fecha_entrega DESC
          LIMIT 17
        `, [Number(userId)]);

        // Query 2: Calificaciones recibidas
        const [calificaciones] = await pool.execute(`
          SELECT 
            'calificacion' as tipo_accion,
            CONCAT('Calificación recibida: "', t.titulo, '" - Nota: ', cal.nota) as descripcion,
            t.titulo as tarea,
            m_mod.nombre as modulo,
            c.nombre as curso,
            cal.nota,
            cal.comentario_docente,
            cal.fecha_calificacion,
            cal.fecha_calificacion as fecha_hora,
            NULL as ip_address
          FROM calificaciones_tareas cal
          INNER JOIN entregas_tareas e ON cal.id_entrega = e.id_entrega
          INNER JOIN tareas_modulo t ON e.id_tarea = t.id_tarea
          INNER JOIN modulos_curso m_mod ON t.id_modulo = m_mod.id_modulo
          INNER JOIN cursos c ON m_mod.id_curso = c.id_curso
          WHERE e.id_estudiante = ?
            AND cal.nota IS NOT NULL
          ORDER BY cal.fecha_calificacion DESC
          LIMIT 17
        `, [Number(userId)]);

        // Query 3: Matrículas
        const [matriculas] = await pool.execute(`
          SELECT 
            'matricula' as tipo_accion,
            CONCAT('Matriculado en: ', c.nombre) as descripcion,
            c.nombre as curso,
            mat.codigo_matricula,
            mat.monto_matricula,
            mat.estado,
            mat.fecha_matricula,
            mat.fecha_matricula as fecha_hora,
            NULL as ip_address
          FROM matriculas mat
          INNER JOIN cursos c ON mat.id_curso = c.id_curso
          WHERE mat.id_estudiante = ?
          ORDER BY mat.fecha_matricula DESC
          LIMIT 16
        `, [Number(userId)]);

        // Formatear tareas
        const tareasFormateadas = tareasSubidas.map(t => ({
          tipo_accion: t.tipo_accion,
          descripcion: t.descripcion,
          detalles: JSON.stringify({
            tarea: t.tarea,
            modulo: t.modulo,
            curso: t.curso,
            fecha_entrega: t.fecha_entrega,
            estado: t.estado,
            archivo_url: t.archivo_url
          }),
          fecha_hora: t.fecha_hora,
          ip_address: t.ip_address
        }));

        // Formatear calificaciones
        const calificacionesFormateadas = calificaciones.map(c => ({
          tipo_accion: c.tipo_accion,
          descripcion: c.descripcion,
          detalles: JSON.stringify({
            tarea: c.tarea,
            modulo: c.modulo,
            curso: c.curso,
            nota: c.nota,
            comentario: c.comentario_docente,
            fecha_calificacion: c.fecha_calificacion
          }),
          fecha_hora: c.fecha_hora,
          ip_address: c.ip_address
        }));

        // Formatear matrículas
        const matriculasFormateadas = matriculas.map(m => ({
          tipo_accion: m.tipo_accion,
          descripcion: m.descripcion,
          detalles: JSON.stringify({
            curso: m.curso,
            codigo_matricula: m.codigo_matricula,
            monto_matricula: m.monto_matricula,
            estado: m.estado,
            fecha_matricula: m.fecha_matricula
          }),
          fecha_hora: m.fecha_hora,
          ip_address: m.ip_address
        }));

        // Combinar resultados
        acciones = [...acciones, ...tareasFormateadas, ...calificacionesFormateadas, ...matriculasFormateadas];
      }
    }

    // PARA DOCENTES
    if (rol === 'docente') {
      if (tipo === 'administrativas' || tipo === 'todas' || !tipo) {
        console.log('Ejecutando query administrativas DOCENTE para userId:', userId);

        const [cambiosAdmin] = await pool.execute(`
          SELECT 
            'cambio_sistema' as tipo_accion,
            CONCAT('Actualización de perfil') as descripcion,
            a.datos_nuevos as detalles,
            a.fecha_operacion as fecha_hora,
            a.ip_address
          FROM auditoria_sistema a
          WHERE a.usuario_id = ?
            AND a.tabla_afectada = 'usuarios'
            AND a.operacion = 'UPDATE'
          ORDER BY fecha_hora DESC
          LIMIT 50
        `, [Number(userId)]);

        acciones = [...acciones, ...cambiosAdmin];
      }

      if (tipo === 'academicas' || tipo === 'todas' || !tipo) {
        // 2. Historial académico: módulos, tareas, calificaciones
        if (!idDocente) {
          return res.json({
            success: true,
            data: {
              usuario: { id: userId, rol },
              acciones: []
            }
          });
        }

        console.log('Ejecutando queries académicas DOCENTE separadas para idDocente:', idDocente);

        // Query 1: Módulos creados
        const [modulosCreados] = await pool.execute(`
          SELECT 
            'modulo_creado' as tipo_accion,
            CONCAT('Módulo creado: "', m.nombre, '" - ', c.nombre) as descripcion,
            m.nombre as modulo,
            c.nombre as curso,
            m.descripcion as modulo_descripcion,
            m.fecha_inicio,
            m.fecha_creacion as fecha_hora,
            NULL as ip_address
          FROM modulos_curso m
          INNER JOIN cursos c ON m.id_curso = c.id_curso
          WHERE m.id_docente = ?
          ORDER BY m.fecha_creacion DESC
          LIMIT 17
        `, [Number(idDocente)]);

        // Query 2: Tareas creadas
        const [tareasCreadas] = await pool.execute(`
          SELECT 
            'tarea_creada' as tipo_accion,
            CONCAT('Tarea creada: "', t.titulo, '" - ', m.nombre) as descripcion,
            t.titulo as tarea,
            m.nombre as modulo,
            c.nombre as curso,
            t.fecha_limite,
            t.descripcion as tarea_descripcion,
            t.fecha_creacion as fecha_hora,
            NULL as ip_address
          FROM tareas_modulo t
          INNER JOIN modulos_curso m ON t.id_modulo = m.id_modulo
          INNER JOIN cursos c ON m.id_curso = c.id_curso
          WHERE t.id_docente = ?
          ORDER BY t.fecha_creacion DESC
          LIMIT 17
        `, [Number(idDocente)]);

        // Query 3: Calificaciones asignadas
        const [calificacionesAsignadas] = await pool.execute(`
          SELECT 
            'entrega_calificada' as tipo_accion,
            CONCAT('Calificación asignada: ', u.nombre, ' ', u.apellido, ' - "', t.titulo, '" (', cal.nota, ')') as descripcion,
            CONCAT(u.nombre, ' ', u.apellido) as estudiante,
            t.titulo as tarea,
            m.nombre as modulo,
            c.nombre as curso,
            cal.nota,
            cal.comentario_docente,
            cal.fecha_calificacion as fecha_hora,
            NULL as ip_address
          FROM calificaciones_tareas cal
          INNER JOIN entregas_tareas e ON cal.id_entrega = e.id_entrega
          INNER JOIN tareas_modulo t ON e.id_tarea = t.id_tarea
          INNER JOIN modulos_curso m ON t.id_modulo = m.id_modulo
          INNER JOIN cursos c ON m.id_curso = c.id_curso
          INNER JOIN usuarios u ON e.id_estudiante = u.id_usuario
          WHERE cal.calificado_por = ?
            AND cal.nota IS NOT NULL
          ORDER BY cal.fecha_calificacion DESC
          LIMIT 16
        `, [Number(idDocente)]);

        // Formatear módulos
        const modulosFormateados = modulosCreados.map(m => ({
          tipo_accion: m.tipo_accion,
          descripcion: m.descripcion,
          detalles: JSON.stringify({
            modulo: m.modulo,
            curso: m.curso,
            descripcion: m.modulo_descripcion,
            fecha_inicio: m.fecha_inicio
          }),
          fecha_hora: m.fecha_hora,
          ip_address: m.ip_address
        }));

        // Formatear tareas
        const tareasFormateadas = tareasCreadas.map(t => ({
          tipo_accion: t.tipo_accion,
          descripcion: t.descripcion,
          detalles: JSON.stringify({
            tarea: t.tarea,
            modulo: t.modulo,
            curso: t.curso,
            fecha_limite: t.fecha_limite,
            descripcion: t.tarea_descripcion
          }),
          fecha_hora: t.fecha_hora,
          ip_address: t.ip_address
        }));

        // Formatear calificaciones
        const calificacionesFormateadas = calificacionesAsignadas.map(c => ({
          tipo_accion: c.tipo_accion,
          descripcion: c.descripcion,
          detalles: JSON.stringify({
            estudiante: c.estudiante,
            tarea: c.tarea,
            modulo: c.modulo,
            curso: c.curso,
            nota: c.nota,
            comentario: c.comentario_docente
          }),
          fecha_hora: c.fecha_hora,
          ip_address: c.ip_address
        }));

        // Combinar resultados
        acciones = [...acciones, ...modulosFormateados, ...tareasFormateadas, ...calificacionesFormateadas];
      }
    }

    // Ordenar todas las acciones por fecha
    acciones.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));

    res.json({
      success: true,
      data: {
        usuario: {
          id: userId,
          rol: rol
        },
        acciones: acciones.slice(0, limite)
      }
    });

  } catch (error) {
    console.error('Error en obtenerHistorialDetallado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historial detallado',
      error: error.message
    });
  }
}

/**
 * Obtener historial COMPLETO del sistema con información detallada
 * Para Superadmin - Muestra TODO lo que hacen admins, docentes y estudiantes
 */
async function obtenerHistorialCompleto(req, res) {
  try {
    const {
      pagina = 1,
      limite = 50,
      tabla,
      operacion,
      usuario_id,
      rol,
      fecha_inicio,
      fecha_fin,
      busqueda
    } = req.query;

    const offset = (pagina - 1) * limite;
    let whereConditions = [];
    let params = [];

    // Filtros
    if (usuario_id) {
      whereConditions.push('a.usuario_id = ?');
      params.push(usuario_id);
    }

    if (tabla) {
      whereConditions.push('a.tabla_afectada = ?');
      params.push(tabla);
    }

    if (operacion) {
      whereConditions.push('a.operacion = ?');
      params.push(operacion);
    }

    if (rol) {
      whereConditions.push('r.nombre_rol = ?');
      params.push(rol);
    }

    if (fecha_inicio) {
      whereConditions.push('DATE(a.fecha_operacion) >= ?');
      params.push(fecha_inicio);
    }

    if (fecha_fin) {
      whereConditions.push('DATE(a.fecha_operacion) <= ?');
      params.push(fecha_fin);
    }

    if (busqueda) {
      whereConditions.push('(u.nombre LIKE ? OR u.apellido LIKE ? OR a.tabla_afectada LIKE ? OR a.datos_nuevos LIKE ?)');
      const searchTerm = `%${busqueda}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // SIEMPRE excluir superadmin de los registros (solo hay uno y no debe aparecer en trazabilidad)
    whereConditions.push('r.nombre_rol != ?');
    params.push('superadmin');

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Query principal - Obtener TODAS las acciones del sistema
    const query = `
      SELECT 
        a.id_auditoria,
        a.tabla_afectada,
        a.operacion,
        a.id_registro,
        a.usuario_id,
        a.datos_anteriores,
        a.datos_nuevos,
        a.ip_address,
        a.user_agent,
        a.fecha_operacion,
        u.nombre AS usuario_nombre,
        u.apellido AS usuario_apellido,
        u.username AS usuario_username,
        u.email AS usuario_email,
        u.cedula AS usuario_cedula,
        r.nombre_rol AS usuario_rol
      FROM auditoria_sistema a
      LEFT JOIN usuarios u ON a.usuario_id = u.id_usuario
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      ${whereClause}
      ORDER BY a.fecha_operacion DESC
      LIMIT ? OFFSET ?
    `;

    params.push(parseInt(limite), parseInt(offset));

    const [auditorias] = await pool.query(query, params);

    // Contar total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM auditoria_sistema a
      LEFT JOIN usuarios u ON a.usuario_id = u.id_usuario
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      ${whereClause}
    `;

    const countParams = params.slice(0, -2);
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].total;

    // Formatear cada auditoría con detalles específicos para TODAS las tablas
    const auditoriasFormateadas = [];

    for (const aud of auditorias) {
      let detalles = {};
      let descripcion = '';

      try {
        // Manejar datos_nuevos: si ya es objeto (por driver mysql2) usarlo, si es string parsearlo
        let datosNuevos = {};
        if (aud.datos_nuevos) {
          datosNuevos = typeof aud.datos_nuevos === 'string'
            ? JSON.parse(aud.datos_nuevos)
            : aud.datos_nuevos;
        }

        // Manejar datos_anteriores: igual
        let datosAnteriores = {};
        if (aud.datos_anteriores) {
          datosAnteriores = typeof aud.datos_anteriores === 'string'
            ? JSON.parse(aud.datos_anteriores)
            : aud.datos_anteriores;
        }

        const nombreUsuario = `${aud.usuario_nombre || ''} ${aud.usuario_apellido || ''}`.trim();

        // Verificar si hay datos para formatear
        const tienesDatos = Object.keys(datosNuevos).length > 0 || Object.keys(datosAnteriores).length > 0;

        // =============================================
        // DESCRIPCIONES DETALLADAS POR TABLA Y OPERACIÓN
        // =============================================
        switch (aud.tabla_afectada) {

          // ========== USUARIOS ==========
          case 'usuarios':
            // SIEMPRE intentar obtener info del usuario desde la BD
            let infoUsuarioAuditado = null;
            try {
              const [userRows] = await pool.execute(
                'SELECT u.nombre, u.apellido, u.cedula, u.email, r.nombre_rol FROM usuarios u LEFT JOIN roles r ON u.id_rol = r.id_rol WHERE u.id_usuario = ?',
                [aud.id_registro]
              );
              if (userRows.length > 0) {
                infoUsuarioAuditado = userRows[0];
              }
            } catch (dbErr) {
              console.error('Error consultando usuario:', dbErr.message);
            }

            if (aud.operacion === 'INSERT') {
              if (infoUsuarioAuditado) {
                descripcion = `Creó nuevo usuario "${infoUsuarioAuditado.nombre} ${infoUsuarioAuditado.apellido}" - Rol: ${infoUsuarioAuditado.nombre_rol || 'asignado'}`;
                detalles = {
                  usuario_creado: `${infoUsuarioAuditado.nombre} ${infoUsuarioAuditado.apellido}`,
                  cedula: infoUsuarioAuditado.cedula,
                  email: infoUsuarioAuditado.email,
                  rol: infoUsuarioAuditado.nombre_rol
                };
              } else if (datosNuevos.nombre && datosNuevos.apellido) {
                descripcion = `Creó nuevo usuario "${datosNuevos.nombre} ${datosNuevos.apellido}" con rol ${datosNuevos.rol || 'asignado'}`;
                detalles = {
                  usuario_creado: `${datosNuevos.nombre} ${datosNuevos.apellido}`,
                  cedula: datosNuevos.cedula,
                  email: datosNuevos.email,
                  rol: datosNuevos.rol
                };
              } else {
                descripcion = `Creó nuevo usuario (ID: ${aud.id_registro})`;
                detalles = { id_usuario: aud.id_registro };
              }
            } else if (aud.operacion === 'UPDATE') {
              const nombreUsuarioAfectado = infoUsuarioAuditado
                ? `${infoUsuarioAuditado.nombre} ${infoUsuarioAuditado.apellido}`
                : null;

              if (datosNuevos.password || datosNuevos.password_changed) {
                descripcion = nombreUsuarioAfectado
                  ? `${nombreUsuarioAfectado} cambió su contraseña`
                  : `Usuario cambió su contraseña de acceso`;
                detalles = { accion: 'Cambio de contraseña', usuario: nombreUsuarioAfectado };
              } else if (datosNuevos.cuenta_bloqueada !== undefined && datosNuevos.cuenta_bloqueada !== datosAnteriores.cuenta_bloqueada) {
                if (datosNuevos.cuenta_bloqueada) {
                  descripcion = nombreUsuarioAfectado
                    ? `Bloqueó cuenta de ${nombreUsuarioAfectado} - Motivo: ${datosNuevos.motivo_bloqueo || 'No especificado'}`
                    : `Bloqueó cuenta de usuario - Motivo: ${datosNuevos.motivo_bloqueo || 'No especificado'}`;
                  detalles = { usuario: nombreUsuarioAfectado, motivo: datosNuevos.motivo_bloqueo };
                } else {
                  descripcion = nombreUsuarioAfectado
                    ? `Desbloqueó cuenta de ${nombreUsuarioAfectado}`
                    : `Desbloqueó cuenta de usuario`;
                  detalles = { usuario: nombreUsuarioAfectado, accion: 'Desbloqueo' };
                }
              } else if (datosNuevos.desbloqueo_temporal !== undefined && datosNuevos.desbloqueo_temporal) {
                descripcion = nombreUsuarioAfectado
                  ? `Otorgó desbloqueo temporal a ${nombreUsuarioAfectado}`
                  : `Otorgó desbloqueo temporal hasta ${datosNuevos.expira_desbloqueo || 'fecha no definida'}`;
                detalles = { usuario: nombreUsuarioAfectado, expira: datosNuevos.expira_desbloqueo };
              } else if (datosNuevos.estado && datosAnteriores.estado && datosNuevos.estado !== datosAnteriores.estado) {
                descripcion = nombreUsuarioAfectado
                  ? `Cambió estado de ${nombreUsuarioAfectado} de "${datosAnteriores.estado}" a "${datosNuevos.estado}"`
                  : `Cambió estado de usuario de "${datosAnteriores.estado}" a "${datosNuevos.estado}"`;
                detalles = { usuario: nombreUsuarioAfectado, estado_anterior: datosAnteriores.estado, estado_nuevo: datosNuevos.estado };
              } else if (datosNuevos.foto_perfil_url || datosNuevos.accion === 'actualizar_foto_perfil') {
                descripcion = nombreUsuarioAfectado
                  ? `${nombreUsuarioAfectado} actualizó su foto de perfil`
                  : `Usuario actualizó su foto de perfil`;
                detalles = { usuario: nombreUsuarioAfectado, accion: 'Actualización de foto' };
              } else if (datosNuevos.needs_password_reset !== undefined || datosNuevos.accion === 'reset_password') {
                descripcion = nombreUsuarioAfectado
                  ? `Reseteó contraseña de ${nombreUsuarioAfectado}`
                  : `Reseteó contraseña de usuario`;
                detalles = { usuario: nombreUsuarioAfectado, accion: 'Reset de contraseña' };
              } else {
                // Actualización genérica con nombre
                descripcion = nombreUsuarioAfectado
                  ? `Actualizó información de ${nombreUsuarioAfectado}`
                  : `Actualizó información de usuario (ID: ${aud.id_registro})`;
                const camposActualizados = Object.keys(datosNuevos).filter(k => k !== 'password' && datosNuevos[k] !== undefined);
                detalles = {
                  usuario: nombreUsuarioAfectado,
                  campos_actualizados: camposActualizados.length > 0 ? camposActualizados.join(', ') : 'No especificado'
                };
              }
            } else if (aud.operacion === 'DELETE') {
              const nombreEliminado = datosAnteriores.nombre && datosAnteriores.apellido
                ? `${datosAnteriores.nombre} ${datosAnteriores.apellido}`
                : null;
              descripcion = nombreEliminado
                ? `Eliminó el usuario "${nombreEliminado}"`
                : `Eliminó usuario (ID: ${aud.id_registro})`;
              detalles = { usuario_eliminado: nombreEliminado || `ID: ${aud.id_registro}` };
            }
            break;

          // ========== CURSOS ==========
          case 'cursos':
            if (aud.operacion === 'INSERT') {
              descripcion = `Creó el curso "${datosNuevos.nombre}" (${datosNuevos.codigo_curso}) - Horario: ${datosNuevos.horario}`;
              detalles = {
                curso: datosNuevos.nombre,
                codigo: datosNuevos.codigo_curso,
                horario: datosNuevos.horario,
                capacidad: datosNuevos.capacidad_maxima,
                fecha_inicio: datosNuevos.fecha_inicio,
                fecha_fin: datosNuevos.fecha_fin,
                estado: datosNuevos.estado
              };
            } else if (aud.operacion === 'UPDATE') {
              if (datosNuevos.estado !== datosAnteriores.estado) {
                descripcion = `Cambió estado del curso "${datosNuevos.nombre || datosAnteriores.nombre}" de "${datosAnteriores.estado}" a "${datosNuevos.estado}"`;
              } else if (datosNuevos.cupos_disponibles !== datosAnteriores.cupos_disponibles) {
                descripcion = `Se actualizaron los cupos del curso "${datosNuevos.nombre || datosAnteriores.nombre}" (${datosAnteriores.cupos_disponibles} → ${datosNuevos.cupos_disponibles})`;
              } else {
                descripcion = `Actualizó información del curso "${datosNuevos.nombre || datosAnteriores.nombre}"`;
              }
              detalles = { curso: datosNuevos.nombre || datosAnteriores.nombre, codigo: datosNuevos.codigo_curso || datosAnteriores.codigo_curso };
            } else if (aud.operacion === 'DELETE') {
              const nombreCursoEliminado = datosAnteriores.nombre || 'No disponible';
              const codigoCursoEliminado = datosAnteriores.codigo_curso || 'N/A';
              descripcion = `Eliminó el curso "${nombreCursoEliminado}" (${codigoCursoEliminado})`;
              detalles = {
                accion: 'Eliminación de curso',
                curso_eliminado: nombreCursoEliminado,
                codigo: codigoCursoEliminado,
                horario: datosAnteriores.horario,
                capacidad_maxima: datosAnteriores.capacidad_maxima,
                estado_anterior: datosAnteriores.estado
              };
            }
            break;

          // ========== TIPOS DE CURSOS ==========
          case 'tipos_cursos':
            if (aud.operacion === 'INSERT') {
              descripcion = `Creó nuevo tipo de curso "${datosNuevos.nombre}" - Duración: ${datosNuevos.duracion_meses} meses - Precio: $${datosNuevos.precio_base}`;
              detalles = {
                tipo_curso: datosNuevos.nombre,
                duracion_meses: datosNuevos.duracion_meses,
                precio_base: datosNuevos.precio_base,
                modalidad_pago: datosNuevos.modalidad_pago
              };
            } else if (aud.operacion === 'UPDATE') {
              descripcion = `Actualizó el tipo de curso "${datosNuevos.nombre || datosAnteriores.nombre}"`;
              detalles = { tipo_curso: datosNuevos.nombre || datosAnteriores.nombre };
            } else if (aud.operacion === 'DELETE') {
              descripcion = `Eliminó el tipo de curso "${datosAnteriores.nombre}"`;
              detalles = { tipo_eliminado: datosAnteriores.nombre };
            }
            break;

          // ========== MATRÍCULAS ==========
          case 'matriculas':
            if (aud.operacion === 'INSERT') {
              descripcion = `Aprobó matrícula ${datosNuevos.codigo_matricula} - Monto: $${datosNuevos.monto_matricula}`;
              detalles = {
                codigo_matricula: datosNuevos.codigo_matricula,
                monto: datosNuevos.monto_matricula,
                email_generado: datosNuevos.email_generado,
                estado: datosNuevos.estado
              };
            } else if (aud.operacion === 'UPDATE') {
              if (datosNuevos.estado !== datosAnteriores.estado) {
                descripcion = `Cambió estado de matrícula ${datosNuevos.codigo_matricula || datosAnteriores.codigo_matricula} de "${datosAnteriores.estado}" a "${datosNuevos.estado}"`;
              } else {
                descripcion = `Actualizó matrícula ${datosNuevos.codigo_matricula || datosAnteriores.codigo_matricula}`;
              }
              detalles = { codigo_matricula: datosNuevos.codigo_matricula || datosAnteriores.codigo_matricula };
            }
            break;

          // ========== SOLICITUDES DE MATRÍCULA ==========
          case 'solicitudes_matricula':
            if (aud.operacion === 'INSERT') {
              if (datosNuevos.codigo_solicitud) {
                descripcion = `Nueva solicitud de matrícula ${datosNuevos.codigo_solicitud} de "${datosNuevos.nombre_solicitante || ''} ${datosNuevos.apellido_solicitante || ''}"`.trim();
                detalles = {
                  codigo: datosNuevos.codigo_solicitud,
                  solicitante: `${datosNuevos.nombre_solicitante || ''} ${datosNuevos.apellido_solicitante || ''}`.trim(),
                  email: datosNuevos.email_solicitante,
                  horario: datosNuevos.horario_preferido,
                  monto: datosNuevos.monto_matricula
                };
              } else {
                // Consultar solicitud desde la BD
                try {
                  const [solInfo] = await pool.execute(
                    'SELECT codigo_solicitud, nombre_solicitante, apellido_solicitante, email_solicitante, estado FROM solicitudes_matricula WHERE id_solicitud = ?',
                    [aud.id_registro]
                  );
                  if (solInfo.length > 0) {
                    descripcion = `Nueva solicitud de matrícula ${solInfo[0].codigo_solicitud} de "${solInfo[0].nombre_solicitante} ${solInfo[0].apellido_solicitante}"`;
                    detalles = {
                      codigo: solInfo[0].codigo_solicitud,
                      solicitante: `${solInfo[0].nombre_solicitante} ${solInfo[0].apellido_solicitante}`,
                      email: solInfo[0].email_solicitante,
                      estado: solInfo[0].estado
                    };
                  } else {
                    descripcion = `Nueva solicitud de matrícula (ID: ${aud.id_registro})`;
                    detalles = { id_solicitud: aud.id_registro };
                  }
                } catch (e) {
                  descripcion = `Nueva solicitud de matrícula (ID: ${aud.id_registro})`;
                  detalles = { id_solicitud: aud.id_registro };
                }
              }
            } else if (aud.operacion === 'UPDATE') {
              // Intentar obtener info de la BD si no hay datos
              let codigoSolicitud = datosNuevos.codigo_solicitud || datosAnteriores.codigo_solicitud;
              let nombreSolicitante = '';
              let estadoAnterior = datosAnteriores.estado;
              let estadoNuevo = datosNuevos.estado;

              if (!codigoSolicitud || !estadoAnterior) {
                try {
                  const [solInfo] = await pool.execute(
                    'SELECT codigo_solicitud, nombre_solicitante, apellido_solicitante, estado, email_solicitante FROM solicitudes_matricula WHERE id_solicitud = ?',
                    [aud.id_registro]
                  );
                  if (solInfo.length > 0) {
                    codigoSolicitud = solInfo[0].codigo_solicitud;
                    nombreSolicitante = `${solInfo[0].nombre_solicitante} ${solInfo[0].apellido_solicitante}`;
                    estadoNuevo = estadoNuevo || solInfo[0].estado;
                  }
                } catch (e) {
                  // Silenciar error
                }
              }

              if (estadoNuevo === 'aprobado' || (estadoNuevo === 'aprobada' && estadoAnterior !== 'aprobado')) {
                descripcion = nombreSolicitante
                  ? `Aprobó solicitud ${codigoSolicitud || ''} de ${nombreSolicitante}`.trim()
                  : `Aprobó solicitud de matrícula ${codigoSolicitud || `(ID: ${aud.id_registro})`}`;
              } else if (estadoNuevo === 'rechazado' || estadoNuevo === 'rechazada') {
                const motivoRechazo = datosNuevos.observaciones || datosNuevos.motivo_rechazo || 'No especificado';
                descripcion = nombreSolicitante
                  ? `Rechazó solicitud de matrícula ${codigoSolicitud || ''} de ${nombreSolicitante} - Motivo: ${motivoRechazo}`
                  : `Rechazó solicitud de matrícula ${codigoSolicitud || ''} - Motivo: ${motivoRechazo}`;
                detalles = {
                  accion: 'Rechazo de solicitud',
                  codigo: codigoSolicitud || `ID: ${aud.id_registro}`,
                  solicitante: nombreSolicitante || 'No disponible',
                  estado_anterior: estadoAnterior || 'pendiente',
                  estado_nuevo: estadoNuevo,
                  motivo_rechazo: motivoRechazo,
                  observaciones: datosNuevos.observaciones,
                  rechazado_por: nombreUsuario || 'Admin'
                };
                break; // Salir del case para no sobrescribir detalles
              } else if (estadoNuevo === 'observaciones') {
                descripcion = `Envió observaciones a solicitud ${codigoSolicitud || ''}`;
              } else {
                descripcion = nombreSolicitante
                  ? `Actualizó solicitud ${codigoSolicitud || ''} de ${nombreSolicitante}`.trim()
                  : `Actualizó solicitud de matrícula ${codigoSolicitud || `(ID: ${aud.id_registro})`}`;
              }
              detalles = {
                codigo: codigoSolicitud || `ID: ${aud.id_registro}`,
                solicitante: nombreSolicitante || 'No disponible',
                estado_anterior: estadoAnterior || 'No registrado',
                estado_nuevo: estadoNuevo || 'No registrado',
                observaciones: datosNuevos.observaciones
              };
            }
            break;

          // ========== PAGOS MENSUALES ==========
          case 'pagos_mensuales':
            if (aud.operacion === 'INSERT') {
              descripcion = `Generó cuota #${datosNuevos.numero_cuota} por $${datosNuevos.monto} - Vence: ${datosNuevos.fecha_vencimiento}`;
              detalles = {
                cuota: datosNuevos.numero_cuota,
                monto: datosNuevos.monto,
                vencimiento: datosNuevos.fecha_vencimiento,
                estado: datosNuevos.estado
              };
            } else if (aud.operacion === 'UPDATE') {
              // Manejar el nombre del estudiante que puede venir en diferentes formatos
              const estudianteInfo = datosNuevos.estudiante_nombre || 
                (datosAnteriores.estudiante_nombre ? datosAnteriores.estudiante_nombre : null);
              const cursoInfo = datosNuevos.nombre_curso || datosNuevos.curso_nombre || null;

              if (datosNuevos.estado === 'verificado' && datosAnteriores.estado !== 'verificado') {
                if (estudianteInfo && cursoInfo) {
                  descripcion = `Verificó pago de ${estudianteInfo} - Cuota #${datosNuevos.numero_cuota || datosAnteriores.numero_cuota} ($${datosNuevos.monto || datosAnteriores.monto}) - ${cursoInfo}`;
                } else {
                  descripcion = `Verificó pago de cuota #${datosNuevos.numero_cuota || datosAnteriores.numero_cuota} por $${datosNuevos.monto || datosAnteriores.monto}`;
                }
              } else if (datosNuevos.estado === 'pagado' && datosAnteriores.estado !== 'pagado') {
                if (estudianteInfo && cursoInfo) {
                  descripcion = `${estudianteInfo} subió pago - Cuota #${datosNuevos.numero_cuota || datosAnteriores.numero_cuota} ($${datosNuevos.monto || datosAnteriores.monto}) - ${cursoInfo} - Método: ${datosNuevos.metodo_pago || 'No especificado'}`;
                } else {
                  descripcion = `Registró pago de cuota #${datosNuevos.numero_cuota || datosAnteriores.numero_cuota} - Método: ${datosNuevos.metodo_pago || 'No especificado'}`;
                }
              } else if (datosNuevos.estado === 'pendiente' && datosAnteriores.estado === 'pagado' && datosNuevos.accion === 'pago_rechazado') {
                if (estudianteInfo && cursoInfo) {
                  descripcion = `Rechazó pago de ${estudianteInfo} - Cuota #${datosNuevos.numero_cuota || datosAnteriores.numero_cuota} ($${datosNuevos.monto || datosAnteriores.monto}) - ${cursoInfo}${datosNuevos.observaciones ? ` - Motivo: ${datosNuevos.observaciones}` : ''}`;
                } else {
                  descripcion = `Rechazó pago de cuota #${datosNuevos.numero_cuota || datosAnteriores.numero_cuota}${datosNuevos.observaciones ? ` - Motivo: ${datosNuevos.observaciones}` : ''}`;
                }
              } else if (datosNuevos.estado === 'vencido') {
                descripcion = `Cuota #${datosNuevos.numero_cuota || datosAnteriores.numero_cuota} marcada como vencida`;
              } else {
                descripcion = `Actualizó pago de cuota #${datosNuevos.numero_cuota || datosAnteriores.numero_cuota}`;
              }
              detalles = {
                cuota: datosNuevos.numero_cuota || datosAnteriores.numero_cuota,
                monto: datosNuevos.monto || datosAnteriores.monto,
                estado_anterior: datosAnteriores.estado,
                estado_nuevo: datosNuevos.estado,
                metodo_pago: datosNuevos.metodo_pago,
                comprobante: datosNuevos.numero_comprobante,
                estudiante: estudianteInfo,
                curso: cursoInfo,
                observaciones: datosNuevos.observaciones
              };
            }
            break;

          // ========== DOCENTES ==========
          case 'docentes':
            if (aud.operacion === 'INSERT') {
              descripcion = `Registró nuevo docente "${datosNuevos.nombres} ${datosNuevos.apellidos}" - ID: ${datosNuevos.identificacion}`;
              detalles = {
                docente: `${datosNuevos.nombres} ${datosNuevos.apellidos}`,
                identificacion: datosNuevos.identificacion,
                titulo: datosNuevos.titulo_profesional,
                experiencia: datosNuevos.experiencia_anos
              };
            } else if (aud.operacion === 'UPDATE') {
              const nombreCompletoDocente = `${datosNuevos.nombres || datosAnteriores.nombres} ${datosNuevos.apellidos || datosAnteriores.apellidos}`;
              if (datosNuevos.estado !== datosAnteriores.estado) {
                const accionEstado = datosNuevos.estado === 'activo' ? 'Activó' : 'Desactivó';
                descripcion = `${accionEstado} al docente "${nombreCompletoDocente}" (estado cambiado de "${datosAnteriores.estado}" a "${datosNuevos.estado}")`;
                detalles = {
                  accion: `${accionEstado} docente`,
                  docente: nombreCompletoDocente,
                  identificacion: datosNuevos.identificacion || datosAnteriores.identificacion,
                  estado_anterior: datosAnteriores.estado,
                  estado_nuevo: datosNuevos.estado,
                  titulo_profesional: datosNuevos.titulo_profesional || datosAnteriores.titulo_profesional
                };
              } else {
                const camposActualizados = [];
                if (datosNuevos.nombres && datosNuevos.nombres !== datosAnteriores.nombres) camposActualizados.push('Nombres');
                if (datosNuevos.apellidos && datosNuevos.apellidos !== datosAnteriores.apellidos) camposActualizados.push('Apellidos');
                if (datosNuevos.titulo_profesional && datosNuevos.titulo_profesional !== datosAnteriores.titulo_profesional) camposActualizados.push('Título');
                if (datosNuevos.experiencia_anos && datosNuevos.experiencia_anos !== datosAnteriores.experiencia_anos) camposActualizados.push('Experiencia');
                if (datosNuevos.email && datosNuevos.email !== datosAnteriores.email) camposActualizados.push('Email');
                if (datosNuevos.telefono && datosNuevos.telefono !== datosAnteriores.telefono) camposActualizados.push('Teléfono');
                
                descripcion = `Actualizó información del docente "${nombreCompletoDocente}"${camposActualizados.length > 0 ? ` - Campos: ${camposActualizados.join(', ')}` : ''}`;
                detalles = {
                  accion: 'Actualización de docente',
                  docente: nombreCompletoDocente,
                  identificacion: datosNuevos.identificacion || datosAnteriores.identificacion,
                  campos_actualizados: camposActualizados.join(', ') || 'Información general'
                };
              }
            } else if (aud.operacion === 'DELETE') {
              const nombreCompletoEliminado = `${datosAnteriores.nombres} ${datosAnteriores.apellidos}`;
              descripcion = `Eliminó/Desactivó al docente "${nombreCompletoEliminado}" (ID: ${datosAnteriores.identificacion})`;
              detalles = {
                accion: 'Eliminación de docente',
                docente_eliminado: nombreCompletoEliminado,
                identificacion: datosAnteriores.identificacion,
                titulo_profesional: datosAnteriores.titulo_profesional,
                experiencia_anos: datosAnteriores.experiencia_anos,
                email: datosAnteriores.email,
                estado_anterior: datosAnteriores.estado
              };
            }
            break;

          // ========== AULAS ==========
          case 'aulas':
            if (aud.operacion === 'INSERT') {
              descripcion = `Creó el aula "${datosNuevos.nombre}" (${datosNuevos.codigo_aula}) - Ubicación: ${datosNuevos.ubicacion || 'No especificada'}`;
              detalles = {
                aula: datosNuevos.nombre,
                codigo: datosNuevos.codigo_aula,
                ubicacion: datosNuevos.ubicacion,
                estado: datosNuevos.estado
              };
            } else if (aud.operacion === 'UPDATE') {
              if (datosNuevos.estado !== datosAnteriores.estado) {
                descripcion = `Cambió estado del aula "${datosNuevos.nombre || datosAnteriores.nombre}" de "${datosAnteriores.estado}" a "${datosNuevos.estado}"`;
              } else {
                descripcion = `Actualizó información del aula "${datosNuevos.nombre || datosAnteriores.nombre}"`;
              }
              detalles = { aula: datosNuevos.nombre || datosAnteriores.nombre };
            } else if (aud.operacion === 'DELETE') {
              descripcion = `Eliminó el aula "${datosAnteriores.nombre}"`;
              detalles = { aula_eliminada: datosAnteriores.nombre };
            }
            break;

          // ========== ASIGNACIONES DE AULAS ==========
          case 'asignaciones_aulas':
            if (aud.operacion === 'INSERT') {
              const aulaInfo = datosNuevos.aula_nombre || datosNuevos.nombre_aula;
              const cursoInfo = datosNuevos.curso_nombre || datosNuevos.nombre_curso;
              const docenteInfo = datosNuevos.docente_nombre || datosNuevos.nombre_docente;
              
              if (aulaInfo && cursoInfo && docenteInfo) {
                descripcion = `Asignó profesor ${docenteInfo} al aula "${aulaInfo}" para curso "${cursoInfo}" - Horario: ${datosNuevos.hora_inicio}-${datosNuevos.hora_fin} - Días: ${datosNuevos.dias}`;
              } else if (aulaInfo && cursoInfo) {
                descripcion = `Asignó aula "${aulaInfo}" para curso "${cursoInfo}" - Horario: ${datosNuevos.hora_inicio}-${datosNuevos.hora_fin} - Días: ${datosNuevos.dias}`;
              } else {
                descripcion = `Asignó aula para curso - Horario: ${datosNuevos.hora_inicio}-${datosNuevos.hora_fin} - Días: ${datosNuevos.dias}`;
              }
              detalles = {
                aula: aulaInfo || 'No especificada',
                codigo_aula: datosNuevos.codigo_aula,
                curso: cursoInfo || 'No especificado',
                codigo_curso: datosNuevos.codigo_curso,
                docente: docenteInfo || 'No especificado',
                hora_inicio: datosNuevos.hora_inicio,
                hora_fin: datosNuevos.hora_fin,
                dias: datosNuevos.dias,
                estado: datosNuevos.estado
              };
            } else if (aud.operacion === 'UPDATE') {
              const aulaInfo = datosNuevos.aula_nombre || datosAnteriores.aula_nombre;
              const cursoInfo = datosNuevos.curso_nombre || datosAnteriores.curso_nombre;
              const docenteInfo = datosNuevos.docente_nombre || datosAnteriores.docente_nombre;
              
              if (datosNuevos.estado !== datosAnteriores.estado) {
                descripcion = `Cambió estado de asignación de aula de "${datosAnteriores.estado}" a "${datosNuevos.estado}"`;
              } else {
                if (aulaInfo && cursoInfo) {
                  descripcion = `Modificó asignación de aula "${aulaInfo}" para curso "${cursoInfo}" - Nuevo horario: ${datosNuevos.hora_inicio || datosAnteriores.hora_inicio}-${datosNuevos.hora_fin || datosAnteriores.hora_fin}`;
                } else {
                  descripcion = `Modificó asignación de aula - Nuevo horario: ${datosNuevos.hora_inicio || datosAnteriores.hora_inicio}-${datosNuevos.hora_fin || datosAnteriores.hora_fin}`;
                }
              }
              detalles = {
                aula: aulaInfo,
                curso: cursoInfo,
                docente: docenteInfo,
                estado: datosNuevos.estado,
                hora_inicio: datosNuevos.hora_inicio || datosAnteriores.hora_inicio,
                hora_fin: datosNuevos.hora_fin || datosAnteriores.hora_fin,
                dias: datosNuevos.dias || datosAnteriores.dias
              };
            } else if (aud.operacion === 'DELETE') {
              const aulaInfo = datosAnteriores.aula_nombre;
              const cursoInfo = datosAnteriores.curso_nombre;
              const docenteInfo = datosAnteriores.docente_nombre;
              
              if (aulaInfo && cursoInfo && docenteInfo) {
                descripcion = `Eliminó asignación de profesor ${docenteInfo} del aula "${aulaInfo}" para curso "${cursoInfo}"`;
              } else if (aulaInfo && cursoInfo) {
                descripcion = `Eliminó asignación de aula "${aulaInfo}" para curso "${cursoInfo}"`;
              } else {
                descripcion = `Eliminó asignación de aula`;
              }
              detalles = {
                asignacion_eliminada: true,
                aula: aulaInfo,
                curso: cursoInfo,
                docente: docenteInfo
              };
            }
            break;

          // ========== PROMOCIONES ==========
          case 'promociones':
            if (aud.operacion === 'INSERT') {
              descripcion = `Creó promoción "${datosNuevos.nombre_promocion}" - ${datosNuevos.meses_gratis} mes(es) gratis`;
              detalles = {
                promocion: datosNuevos.nombre_promocion,
                descripcion: datosNuevos.descripcion,
                meses_gratis: datosNuevos.meses_gratis,
                fecha_inicio: datosNuevos.fecha_inicio,
                fecha_fin: datosNuevos.fecha_fin,
                cupos: datosNuevos.cupos_disponibles
              };
            } else if (aud.operacion === 'UPDATE') {
              if (datosNuevos.activa !== datosAnteriores.activa) {
                descripcion = datosNuevos.activa ? `Activó la promoción "${datosNuevos.nombre_promocion || datosAnteriores.nombre_promocion}"` : `Desactivó la promoción "${datosNuevos.nombre_promocion || datosAnteriores.nombre_promocion}"`;
              } else {
                descripcion = `Actualizó la promoción "${datosNuevos.nombre_promocion || datosAnteriores.nombre_promocion}"`;
              }
              detalles = { promocion: datosNuevos.nombre_promocion || datosAnteriores.nombre_promocion };
            } else if (aud.operacion === 'DELETE') {
              descripcion = `Eliminó la promoción "${datosAnteriores.nombre_promocion}"`;
              detalles = { promocion_eliminada: datosAnteriores.nombre_promocion };
            }
            break;

          // ========== ESTUDIANTE PROMOCIÓN ==========
          case 'estudiante_promocion':
            if (aud.operacion === 'INSERT') {
              descripcion = `Estudiante aceptó promoción - Horario seleccionado: ${datosNuevos.horario_seleccionado || 'No especificado'}`;
              detalles = {
                horario: datosNuevos.horario_seleccionado,
                meses_gratis: datosNuevos.meses_gratis_aplicados,
                inicio_cobro: datosNuevos.fecha_inicio_cobro
              };
            } else if (aud.operacion === 'UPDATE') {
              descripcion = `Actualizó información de promoción del estudiante`;
              detalles = datosNuevos;
            }
            break;

          // ========== MÓDULOS DE CURSO ==========
          case 'modulos_curso':
            if (aud.operacion === 'INSERT') {
              const nombreModulo = datosNuevos.nombre_modulo || datosNuevos.nombre || 'Sin nombre';
              const nombreCurso = datosNuevos.nombre_curso || datosNuevos.curso || '';
              descripcion = nombreCurso 
                ? `Creó módulo/parcial "${nombreModulo}" para el curso "${nombreCurso}"`
                : `Creó módulo/parcial "${nombreModulo}" para el curso`;
              detalles = {
                modulo: nombreModulo,
                curso: nombreCurso,
                descripcion: datosNuevos.descripcion,
                fecha_inicio: datosNuevos.fecha_inicio,
                fecha_fin: datosNuevos.fecha_fin,
                docente: datosNuevos.docente
              };
            } else if (aud.operacion === 'UPDATE') {
              const nombreModulo = datosNuevos.nombre_modulo || datosNuevos.nombre || datosAnteriores.nombre_modulo || datosAnteriores.nombre || 'Módulo';
              if (datosNuevos.promedios_publicados && !datosAnteriores.promedios_publicados) {
                descripcion = `Publicó promedios del módulo "${nombreModulo}"`;
                detalles = {
                  accion: 'Publicación de promedios',
                  modulo: nombreModulo,
                  promedios_publicados: true
                };
              } else if (datosNuevos.estado === 'cerrado' && datosAnteriores.estado !== 'cerrado') {
                descripcion = `Cerró el módulo "${nombreModulo}"${datosNuevos.motivo_cierre ? ` - Motivo: ${datosNuevos.motivo_cierre}` : ''}`;
                detalles = {
                  accion: 'Cierre de módulo',
                  modulo: nombreModulo,
                  estado_anterior: datosAnteriores.estado,
                  estado_nuevo: 'cerrado',
                  motivo_cierre: datosNuevos.motivo_cierre || 'No especificado',
                  fecha_cierre: datosNuevos.fecha_cierre || new Date().toISOString()
                };
              } else if (datosNuevos.estado === 'activo' && datosAnteriores.estado === 'cerrado') {
                descripcion = `Reabrió el módulo "${nombreModulo}"`;
                detalles = {
                  accion: 'Reapertura de módulo',
                  modulo: nombreModulo,
                  estado_anterior: 'cerrado',
                  estado_nuevo: 'activo',
                  fecha_reapertura: new Date().toISOString()
                };
              } else if (datosNuevos.estado !== datosAnteriores.estado) {
                descripcion = `Cambió estado del módulo "${nombreModulo}" de "${datosAnteriores.estado}" a "${datosNuevos.estado}"`;
                detalles = {
                  accion: 'Cambio de estado',
                  modulo: nombreModulo,
                  estado_anterior: datosAnteriores.estado,
                  estado_nuevo: datosNuevos.estado
                };
              } else {
                const camposActualizados = [];
                if (datosNuevos.nombre && datosNuevos.nombre !== datosAnteriores.nombre) camposActualizados.push('Nombre');
                if (datosNuevos.descripcion && datosNuevos.descripcion !== datosAnteriores.descripcion) camposActualizados.push('Descripción');
                if (datosNuevos.fecha_inicio && datosNuevos.fecha_inicio !== datosAnteriores.fecha_inicio) camposActualizados.push('Fecha inicio');
                if (datosNuevos.fecha_fin && datosNuevos.fecha_fin !== datosAnteriores.fecha_fin) camposActualizados.push('Fecha fin');
                
                descripcion = `Actualizó módulo "${nombreModulo}"${camposActualizados.length > 0 ? ` - Campos: ${camposActualizados.join(', ')}` : ''}`;
                detalles = {
                  accion: 'Actualización de módulo',
                  modulo: nombreModulo,
                  campos_actualizados: camposActualizados.join(', ') || 'Información general'
                };
              }
            } else if (aud.operacion === 'DELETE') {
              const nombreModuloEliminado = datosAnteriores.nombre_modulo || datosAnteriores.nombre || 'Módulo eliminado';
              descripcion = `Eliminó el módulo "${nombreModuloEliminado}"`;
              detalles = {
                accion: 'Eliminación de módulo',
                modulo_eliminado: nombreModuloEliminado,
                descripcion: datosAnteriores.descripcion,
                fecha_inicio: datosAnteriores.fecha_inicio,
                fecha_fin: datosAnteriores.fecha_fin,
                estado_anterior: datosAnteriores.estado
              };
            }
            break;

          // ========== TAREAS DE MÓDULO ==========
          case 'tareas_modulo':
            if (aud.operacion === 'INSERT') {
              descripcion = `Creó tarea "${datosNuevos.titulo}" - Nota máx: ${datosNuevos.nota_maxima} - Fecha límite: ${datosNuevos.fecha_limite}`;
              detalles = {
                tarea: datosNuevos.titulo,
                descripcion: datosNuevos.descripcion,
                nota_maxima: datosNuevos.nota_maxima,
                fecha_limite: datosNuevos.fecha_limite,
                ponderacion: datosNuevos.ponderacion
              };
            } else if (aud.operacion === 'UPDATE') {
              const tituloTarea = datosNuevos.titulo || datosAnteriores.titulo;
              if (datosNuevos.estado !== datosAnteriores.estado) {
                descripcion = `Cambió estado de tarea "${tituloTarea}" de "${datosAnteriores.estado}" a "${datosNuevos.estado}"`;
                detalles = {
                  accion: 'Cambio de estado',
                  tarea: tituloTarea,
                  estado_anterior: datosAnteriores.estado,
                  estado_nuevo: datosNuevos.estado
                };
              } else {
                const camposActualizados = [];
                if (datosNuevos.titulo && datosNuevos.titulo !== datosAnteriores.titulo) camposActualizados.push('Título');
                if (datosNuevos.descripcion && datosNuevos.descripcion !== datosAnteriores.descripcion) camposActualizados.push('Descripción');
                if (datosNuevos.fecha_limite && datosNuevos.fecha_limite !== datosAnteriores.fecha_limite) camposActualizados.push('Fecha límite');
                if (datosNuevos.nota_maxima && datosNuevos.nota_maxima !== datosAnteriores.nota_maxima) camposActualizados.push('Nota máxima');
                if (datosNuevos.ponderacion && datosNuevos.ponderacion !== datosAnteriores.ponderacion) camposActualizados.push('Ponderación');
                
                descripcion = `Actualizó tarea "${tituloTarea}"${camposActualizados.length > 0 ? ` - Campos: ${camposActualizados.join(', ')}` : ''}`;
                detalles = {
                  accion: 'Actualización de tarea',
                  tarea: tituloTarea,
                  campos_actualizados: camposActualizados.join(', ') || 'Información general',
                  nota_maxima: datosNuevos.nota_maxima || datosAnteriores.nota_maxima,
                  fecha_limite: datosNuevos.fecha_limite || datosAnteriores.fecha_limite
                };
              }
            } else if (aud.operacion === 'DELETE') {
              descripcion = `Eliminó la tarea "${datosAnteriores.titulo}"`;
              detalles = {
                accion: 'Eliminación de tarea',
                tarea_eliminada: datosAnteriores.titulo,
                descripcion: datosAnteriores.descripcion,
                nota_maxima: datosAnteriores.nota_maxima,
                fecha_limite: datosAnteriores.fecha_limite,
                ponderacion: datosAnteriores.ponderacion,
                estado_anterior: datosAnteriores.estado
              };
            }
            break;

          // ========== ENTREGAS DE TAREAS ==========
          case 'entregas_tareas':
            if (aud.operacion === 'INSERT') {
              const tareaInfo = datosNuevos.titulo_tarea || datosNuevos.tarea_titulo;
              const cursoInfo = datosNuevos.curso_nombre || datosNuevos.nombre_curso;
              if (tareaInfo && cursoInfo) {
                descripcion = `Entregó tarea "${tareaInfo}" - Curso: ${cursoInfo}${datosNuevos.tiene_archivo_nuevo ? ' - Con archivo' : ''}`;
              } else if (tareaInfo) {
                descripcion = `Entregó tarea "${tareaInfo}"${datosNuevos.tiene_archivo_nuevo ? ' - Con archivo' : ''}`;
              } else {
                descripcion = `Entregó tarea - ${datosNuevos.archivo_url || datosNuevos.tiene_archivo_nuevo ? 'Con archivo adjunto' : 'Sin archivo'}`;
              }
              detalles = {
                tarea: tareaInfo || 'No especificada',
                curso: cursoInfo || 'No especificado',
                comentario: datosNuevos.comentario_estudiante,
                tiene_archivo: !!datosNuevos.archivo_url || !!datosNuevos.tiene_archivo_nuevo
              };
            } else if (aud.operacion === 'UPDATE') {
              const tareaInfo = datosNuevos.titulo_tarea || datosNuevos.tarea_titulo;
              const cursoInfo = datosNuevos.curso_nombre || datosNuevos.nombre_curso;
              
              if (datosNuevos.accion === 're_entrega') {
                if (tareaInfo && cursoInfo) {
                  descripcion = `Re-entregó tarea "${tareaInfo}" - Curso: ${cursoInfo}${datosNuevos.tiene_archivo_nuevo ? ' - Con archivo actualizado' : ''}`;
                } else if (tareaInfo) {
                  descripcion = `Re-entregó tarea "${tareaInfo}"${datosNuevos.tiene_archivo_nuevo ? ' - Con archivo actualizado' : ''}`;
                } else {
                  descripcion = `Re-entregó tarea${datosNuevos.tiene_archivo_nuevo ? ' - Con archivo actualizado' : ''}`;
                }
                detalles = {
                  accion: 'Re-entrega',
                  tarea: tareaInfo || 'No especificada',
                  curso: cursoInfo || 'No especificado',
                  comentario: datosNuevos.comentario_estudiante,
                  tiene_archivo: !!datosNuevos.tiene_archivo_nuevo
                };
              } else if (datosNuevos.estado === 'revisado' || datosNuevos.estado === 'calificado') {
                descripcion = `Entrega marcada como "${datosNuevos.estado}"`;
                detalles = { estado: datosNuevos.estado };
              } else {
                descripcion = `Actualizó su entrega de tarea`;
                detalles = { estado: datosNuevos.estado };
              }
            } else if (aud.operacion === 'DELETE') {
              descripcion = `Eliminó entrega de tarea`;
              detalles = { entrega_eliminada: true };
            }
            break;

          // ========== CALIFICACIONES DE TAREAS ==========
          case 'calificaciones_tareas':
            if (aud.operacion === 'INSERT') {
              const tareaInfo = datosNuevos.titulo_tarea || datosNuevos.tarea_titulo || datosNuevos.tarea;
              const estudianteInfo = datosNuevos.estudiante_nombre || datosNuevos.nombre_estudiante;
              const cursoInfo = datosNuevos.curso_nombre || datosNuevos.nombre_curso;
              const docenteInfo = datosNuevos.docente_nombre || datosNuevos.nombre_docente;
              
              if (tareaInfo && estudianteInfo && cursoInfo) {
                descripcion = `${docenteInfo ? docenteInfo + ' ' : ''}Calificó tarea "${tareaInfo}" de ${estudianteInfo} - Curso: ${cursoInfo} - Nota: ${datosNuevos.nota} - Resultado: ${datosNuevos.resultado || 'N/A'}`;
              } else if (tareaInfo && estudianteInfo) {
                descripcion = `${docenteInfo ? docenteInfo + ' ' : ''}Calificó tarea "${tareaInfo}" de ${estudianteInfo} - Nota: ${datosNuevos.nota} - Resultado: ${datosNuevos.resultado || 'N/A'}`;
              } else if (tareaInfo) {
                descripcion = `${docenteInfo ? docenteInfo + ' ' : ''}Calificó tarea "${tareaInfo}" - Nota: ${datosNuevos.nota} - Resultado: ${datosNuevos.resultado || 'N/A'}`;
              } else {
                descripcion = `Calificó tarea con nota ${datosNuevos.nota} - Resultado: ${datosNuevos.resultado || 'N/A'}`;
              }
              detalles = {
                tarea: tareaInfo || 'No especificada',
                estudiante: estudianteInfo || 'No especificado',
                curso: cursoInfo || 'No especificado',
                docente: docenteInfo || 'No especificado',
                nota: datosNuevos.nota,
                resultado: datosNuevos.resultado,
                comentario: datosNuevos.comentario_docente
              };
            } else if (aud.operacion === 'UPDATE') {
              const tareaInfo = datosNuevos.titulo_tarea || datosAnteriores.titulo_tarea;
              descripcion = `Modificó calificación de tarea${tareaInfo ? ` "${tareaInfo}"` : ''} - Nota anterior: ${datosAnteriores.nota} → Nota nueva: ${datosNuevos.nota} - Resultado: ${datosNuevos.resultado || 'N/A'}`;
              detalles = {
                tarea: tareaInfo,
                nota_anterior: datosAnteriores.nota,
                nota_nueva: datosNuevos.nota,
                resultado: datosNuevos.resultado
              };
            }
            break;

          // ========== ASISTENCIAS ==========
          case 'asistencias':
            if (aud.operacion === 'INSERT') {
              descripcion = `Registró asistencia: ${datosNuevos.estado} - Fecha: ${datosNuevos.fecha}`;
              detalles = {
                fecha: datosNuevos.fecha,
                estado: datosNuevos.estado,
                observaciones: datosNuevos.observaciones
              };
            } else if (aud.operacion === 'UPDATE') {
              if (datosNuevos.estado !== datosAnteriores.estado) {
                descripcion = `Modificó asistencia de "${datosAnteriores.estado}" a "${datosNuevos.estado}" - Fecha: ${datosNuevos.fecha || datosAnteriores.fecha}`;
              } else if (datosNuevos.justificacion) {
                descripcion = `Agregó justificación de asistencia - Fecha: ${datosNuevos.fecha || datosAnteriores.fecha}`;
              } else {
                descripcion = `Actualizó registro de asistencia`;
              }
              detalles = {
                fecha: datosNuevos.fecha || datosAnteriores.fecha,
                estado_anterior: datosAnteriores.estado,
                estado_nuevo: datosNuevos.estado,
                justificacion: datosNuevos.justificacion
              };
            }
            break;

          // ========== ESTUDIANTE CURSO (Inscripciones) ==========
          case 'estudiante_curso':
            if (aud.operacion === 'INSERT') {
              descripcion = `Inscribió estudiante en curso - Estado inicial: ${datosNuevos.estado || 'inscrito'}`;
              detalles = {
                estado: datosNuevos.estado
              };
            } else if (aud.operacion === 'UPDATE') {
              if (datosNuevos.estado === 'graduado') {
                descripcion = `Estudiante graduado del curso - Nota final: ${datosNuevos.nota_final || 'N/A'}`;
              } else if (datosNuevos.estado === 'retirado') {
                descripcion = `Estudiante retirado del curso`;
              } else if (datosNuevos.nota_final !== datosAnteriores.nota_final) {
                descripcion = `Actualizó nota final del estudiante a ${datosNuevos.nota_final}`;
              } else {
                descripcion = `Cambió estado del estudiante en curso a "${datosNuevos.estado}"`;
              }
              detalles = {
                estado_anterior: datosAnteriores.estado,
                estado_nuevo: datosNuevos.estado,
                nota_final: datosNuevos.nota_final
              };
            }
            break;

          // ========== NOTIFICACIONES ==========
          case 'notificaciones':
            if (aud.operacion === 'INSERT') {
              descripcion = `Envió notificación: "${datosNuevos.titulo}" - Tipo: ${datosNuevos.tipo}`;
              detalles = {
                titulo: datosNuevos.titulo,
                tipo: datosNuevos.tipo,
                mensaje: datosNuevos.mensaje?.substring(0, 100)
              };
            } else if (aud.operacion === 'UPDATE') {
              if (datosNuevos.leida && !datosAnteriores.leida) {
                descripcion = `Leyó notificación: "${datosNuevos.titulo || datosAnteriores.titulo}"`;
              } else {
                descripcion = `Actualizó notificación`;
              }
              detalles = { titulo: datosNuevos.titulo || datosAnteriores.titulo };
            }
            break;

          // ========== REPORTES GENERADOS ==========
          case 'reportes_generados':
            if (aud.operacion === 'INSERT') {
              descripcion = `Generó reporte en formato ${datosNuevos.formato_generado?.toUpperCase() || 'desconocido'}`;
              detalles = {
                formato: datosNuevos.formato_generado,
                archivo: datosNuevos.archivo_generado,
                estado: datosNuevos.estado
              };
            } else if (aud.operacion === 'UPDATE') {
              descripcion = `Actualizó estado de reporte a "${datosNuevos.estado}"`;
              detalles = { estado: datosNuevos.estado };
            }
            break;

          // ========== SESIONES DE USUARIO ==========
          case 'sesiones_usuario':
            if (aud.operacion === 'INSERT') {
              descripcion = `Inició sesión desde IP: ${datosNuevos.ip_address || 'No registrada'}`;
              detalles = {
                ip: datosNuevos.ip_address,
                user_agent: datosNuevos.user_agent?.substring(0, 50)
              };
            } else if (aud.operacion === 'UPDATE') {
              if (datosNuevos.activa === false || datosNuevos.fecha_cierre) {
                descripcion = `Cerró sesión`;
              } else {
                descripcion = `Actualizó sesión`;
              }
              detalles = { accion: 'Cierre de sesión' };
            }
            break;

          // ========== ROLES ==========
          case 'roles':
            if (aud.operacion === 'INSERT') {
              descripcion = `Creó rol "${datosNuevos.nombre_rol}"`;
              detalles = { rol: datosNuevos.nombre_rol, descripcion: datosNuevos.descripcion };
            } else if (aud.operacion === 'UPDATE') {
              descripcion = `Actualizó rol "${datosNuevos.nombre_rol || datosAnteriores.nombre_rol}"`;
              detalles = { rol: datosNuevos.nombre_rol || datosAnteriores.nombre_rol };
            }
            break;

          // ========== CONFIGURACIÓN DEL SISTEMA ==========
          case 'configuracion_sistema':
            if (aud.operacion === 'INSERT') {
              descripcion = `Agregó configuración "${datosNuevos.clave}" = "${datosNuevos.valor}"`;
            } else if (aud.operacion === 'UPDATE') {
              descripcion = `Modificó configuración "${datosNuevos.clave || datosAnteriores.clave}"`;
            }
            detalles = { clave: datosNuevos.clave || datosAnteriores.clave };
            break;

          // ========== DEFAULT - Tablas no especificadas ==========
          default:
            // Generar descripción genérica pero informativa
            const operacionTexto = {
              'INSERT': 'Creó registro',
              'UPDATE': 'Actualizó registro',
              'DELETE': 'Eliminó registro'
            };
            const tablaLegible = aud.tabla_afectada.replace(/_/g, ' ');
            descripcion = `${operacionTexto[aud.operacion] || aud.operacion} en ${tablaLegible}`;
            detalles = tienesDatos ? datosNuevos : { id_registro: aud.id_registro };
        }

      } catch (e) {
        // En caso de error, mostrar descripción básica pero informativa
        const operacionTexto = {
          'INSERT': 'Creó registro',
          'UPDATE': 'Actualizó registro',
          'DELETE': 'Eliminó registro'
        };
        descripcion = `${operacionTexto[aud.operacion] || aud.operacion} en ${aud.tabla_afectada.replace(/_/g, ' ')}`;
        detalles = { id_registro: aud.id_registro };
      }

      auditoriasFormateadas.push({
        id_auditoria: aud.id_auditoria,
        tabla_afectada: aud.tabla_afectada,
        operacion: aud.operacion,
        descripcion,
        detalles: JSON.stringify(detalles),
        usuario: {
          id: aud.usuario_id,
          nombre: aud.usuario_nombre,
          apellido: aud.usuario_apellido,
          username: aud.usuario_username,
          email: aud.usuario_email,
          cedula: aud.usuario_cedula,
          rol: aud.usuario_rol
        },
        fecha_operacion: aud.fecha_operacion,
        ip_address: aud.ip_address,
        user_agent: aud.user_agent
      });
    }

    res.json({
      success: true,
      data: {
        auditorias: auditoriasFormateadas,
        total,
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error en obtenerHistorialCompleto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historial completo',
      error: error.message
    });
  }
}

module.exports = {
  listarAuditorias,
  obtenerDetalleAuditoria,
  obtenerAuditoriasPorUsuario,
  obtenerAuditoriasPorTabla,
  obtenerEstadisticas,
  obtenerTablasUnicas,
  obtenerHistorialDetallado,
  obtenerHistorialCompleto
};
