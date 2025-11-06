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
    
    console.log('🔍 Debug - userId:', userId, 'tipo:', tipo, 'limite:', limite, 'rol:', rol);
    
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
        console.log('📋 Ejecutando queries administrativas separadas para userId:', userId);
        
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
        console.log('📚 Ejecutando queries académicas separadas para userId:', userId);
        
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
            e.archivo_nombre_original,
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
            archivo: t.archivo_nombre_original
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
        console.log('📋 Ejecutando query administrativas DOCENTE para userId:', userId);
        
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
        
        console.log('📚 Ejecutando queries académicas DOCENTE separadas para idDocente:', idDocente);
        
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

module.exports = {
  listarAuditorias,
  obtenerDetalleAuditoria,
  obtenerAuditoriasPorUsuario,
  obtenerAuditoriasPorTabla,
  obtenerEstadisticas,
  obtenerTablasUnicas,
  obtenerHistorialDetallado
};
