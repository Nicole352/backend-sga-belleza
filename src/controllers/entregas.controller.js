const EntregasModel = require('../models/entregas.model');
const CalificacionesModel = require('../models/calificaciones.model');
const DocentesModel = require('../models/docentes.model');
const { notificarTareaEntregadaDocente, notificarTareaCalificada } = require('../utils/notificationHelper');
const { registrarAuditoria } = require('../utils/auditoria');
const multer = require('multer');
const cloudinaryService = require('../services/cloudinary.service');

// Configuración de Multer para archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de archivo no permitido. Solo PDF, JPG, PNG, WEBP'));
    }
  }
}).single('archivo');

// GET /api/entregas/tarea/:id_tarea - Obtener entregas de una tarea (docente)
async function getEntregasByTarea(req, res) {
  try {
    const { id_tarea } = req.params;

    const entregas = await EntregasModel.getAllByTarea(id_tarea);

    return res.json({
      success: true,
      entregas
    });
  } catch (error) {
    console.error('Error en getEntregasByTarea:', error);
    return res.status(500).json({ error: 'Error obteniendo entregas' });
  }
}

// GET /api/entregas/:id - Obtener entrega por ID
async function getEntregaById(req, res) {
  try {
    const { id } = req.params;

    const entrega = await EntregasModel.getById(id);

    if (!entrega) {
      return res.status(404).json({ error: 'Entrega no encontrada' });
    }

    return res.json({
      success: true,
      entrega
    });
  } catch (error) {
    console.error('Error en getEntregaById:', error);
    return res.status(500).json({ error: 'Error obteniendo entrega' });
  }
}

// POST /api/entregas - Crear nueva entrega (estudiante)
async function createEntrega(req, res) {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Error en upload:', err);
      return res.status(400).json({ error: err.message });
    }

    try {
      const { id_tarea, comentario_estudiante } = req.body;
      const id_estudiante = req.user.id_usuario;

      // Validaciones
      if (!id_tarea) {
        return res.status(400).json({ error: 'ID de tarea es obligatorio' });
      }

      // Verificar si ya existe una entrega
      const existeEntrega = await EntregasModel.existsEntrega(id_tarea, id_estudiante);
      if (existeEntrega) {
        return res.status(400).json({ error: 'Ya has entregado esta tarea. Usa actualizar para modificarla.' });
      }

      // Subir archivo a Cloudinary si existe
      let archivoData = null;

      if (req.file) {
        try {
          console.log('Subiendo tarea a Cloudinary...');
          const archivoCloudinary = await cloudinaryService.uploadFile(
            req.file.buffer,
            'tareas',
            `tarea-${id_tarea}-${id_estudiante}-${Date.now()}`
          );
          console.log('Tarea subida a Cloudinary:', archivoCloudinary.secure_url);

          archivoData = {
            url: archivoCloudinary.secure_url,
            publicId: archivoCloudinary.public_id
          };
        } catch (cloudinaryError) {
          console.error('Error subiendo a Cloudinary:', cloudinaryError);
          return res.status(500).json({
            error: 'Error subiendo archivo a Cloudinary. Por favor, intenta nuevamente.'
          });
        };
      }

      const id_entrega = await EntregasModel.create({
        id_tarea,
        id_estudiante,
        comentario_estudiante
      }, archivoData);

      const entrega = await EntregasModel.getById(id_entrega);

      // Registrar auditoría - Estudiante entregó tarea
      try {
        const { pool } = require('../config/database');
        
        // Obtener información de la tarea para la auditoría
        const [tareaInfoAudit] = await pool.execute(
          `SELECT t.titulo, t.id_modulo, m.id_curso, c.nombre as curso_nombre
           FROM tareas_modulo t 
           JOIN modulos_curso m ON t.id_modulo = m.id_modulo
           JOIN cursos c ON m.id_curso = c.id_curso
           WHERE t.id_tarea = ?`,
          [id_tarea]
        );

        if (tareaInfoAudit.length > 0) {
          await registrarAuditoria({
            tabla_afectada: 'entregas_tareas',
            operacion: 'INSERT',
            id_registro: id_entrega,
            usuario_id: id_estudiante,
            datos_nuevos: {
              id_tarea,
              titulo_tarea: tareaInfoAudit[0].titulo,
              id_modulo: tareaInfoAudit[0].id_modulo,
              id_curso: tareaInfoAudit[0].id_curso,
              curso_nombre: tareaInfoAudit[0].curso_nombre,
              tiene_archivo: archivoData ? true : false,
              comentario_estudiante: comentario_estudiante || null
            },
            ip_address: req.ip || req.connection?.remoteAddress || null,
            user_agent: req.get('user-agent') || null
          });
        }
      } catch (auditError) {
        console.error('Error registrando auditoría de entrega (no afecta la entrega):', auditError);
      }

      // 🔥 Notificar al docente cuando el estudiante entrega una tarea
      try {
        const { pool } = require('../config/database');

        // Obtener información de la tarea, docente y curso
        const [tareaInfo] = await pool.execute(
          `SELECT t.titulo, t.id_modulo, m.id_docente, m.id_curso, c.nombre as curso_nombre
           FROM tareas_modulo t 
           JOIN modulos_curso m ON t.id_modulo = m.id_modulo
           JOIN cursos c ON m.id_curso = c.id_curso
           WHERE t.id_tarea = ?`,
          [id_tarea]
        );

        if (tareaInfo.length > 0) {
          const id_docente_fk = tareaInfo[0].id_docente;
          const id_modulo = tareaInfo[0].id_modulo;
          const titulo_tarea = tareaInfo[0].titulo;
          const curso_nombre = tareaInfo[0].curso_nombre;

          console.log(`ID Docente de la tarea: ${id_docente_fk}`);
          console.log(`Curso: ${curso_nombre}`);

          // Obtener id_usuario del docente (identificacion del docente)
          const [docenteInfo] = await pool.execute(
            'SELECT identificacion FROM docentes WHERE id_docente = ?',
            [id_docente_fk]
          );

          if (docenteInfo.length > 0) {
            const identificacion_docente = docenteInfo[0].identificacion;

            // Obtener id_usuario usando la identificación (cédula)
            const [usuarioDocente] = await pool.execute(
              'SELECT id_usuario FROM usuarios WHERE cedula = ?',
              [identificacion_docente]
            );

            if (usuarioDocente.length > 0) {
              const id_usuario_docente = usuarioDocente[0].id_usuario;

              console.log(`ID Usuario del docente: ${id_usuario_docente}`);

              // Obtener datos del estudiante
              const [estudianteInfo] = await pool.execute(
                'SELECT nombre, apellido FROM usuarios WHERE id_usuario = ?',
                [id_estudiante]
              );

              if (estudianteInfo.length > 0) {
                // Notificar al docente usando su id_usuario
                notificarTareaEntregadaDocente(req, id_usuario_docente, {
                  id_tarea,
                  id_modulo,
                  titulo_tarea,
                  curso_nombre,
                  id_estudiante,
                  nombre_estudiante: estudianteInfo[0].nombre,
                  apellido_estudiante: estudianteInfo[0].apellido
                });

                console.log(`Docente ${id_usuario_docente} notificado: nueva entrega de ${estudianteInfo[0].nombre} ${estudianteInfo[0].apellido} en tarea "${titulo_tarea}" del curso "${curso_nombre}"`);
              }
            } else {
              console.log(`No se encontró usuario para el docente con cédula ${identificacion_docente}`);
            }
          }
        }
      } catch (notifError) {
        console.error('Error notificando al docente (no afecta la entrega):', notifError);
      }

      // Emitir evento WebSocket para actualización en tiempo real
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${id_estudiante}`).emit('tarea_entregada_confirmacion', {
          id_entrega,
          id_tarea,
          mensaje: 'Tarea entregada exitosamente'
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Entrega realizada exitosamente',
        entrega
      });
    } catch (error) {
      console.error('Error en createEntrega:', error);
      return res.status(500).json({ error: 'Error creando entrega' });
    }
  });
}

// PUT /api/entregas/:id - Actualizar entrega (re-entrega)
async function updateEntrega(req, res) {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Error en upload:', err);
      return res.status(400).json({ error: err.message });
    }

    try {
      const { id } = req.params;
      const { comentario_estudiante } = req.body;
      const id_estudiante = req.user.id_usuario;

      // Verificar que la entrega pertenece al estudiante
      const belongsToEstudiante = await EntregasModel.belongsToEstudiante(id, id_estudiante);
      if (!belongsToEstudiante) {
        return res.status(403).json({ error: 'No tienes permiso para modificar esta entrega' });
      }

      // Subir archivo a Cloudinary si existe
      let archivoData = null;

      if (req.file) {
        try {
          console.log('Subiendo tarea actualizada a Cloudinary');
          const archivoCloudinary = await cloudinaryService.uploadFile(
            req.file.buffer,
            'tareas',
            `tarea-${id}-${id_estudiante}-${Date.now()}`
          );
          console.log('Tarea actualizada subida a Cloudinary:', archivoCloudinary.secure_url);

          archivoData = {
            url: archivoCloudinary.secure_url,
            publicId: archivoCloudinary.public_id
          };
        } catch (cloudinaryError) {
          console.error('Error subiendo a Cloudinary:', cloudinaryError);
          return res.status(500).json({
            error: 'Error subiendo archivo a Cloudinary. Por favor, intenta nuevamente.'
          });
        }
      }

      const updated = await EntregasModel.update(id, {
        comentario_estudiante
      }, archivoData);

      if (!updated) {
        return res.status(404).json({ error: 'Entrega no encontrada' });
      }

      const entrega = await EntregasModel.getById(id);

      // Registrar auditoría - Estudiante re-entregó tarea
      try {
        const { pool } = require('../config/database');
        
        // Obtener información de la tarea para la auditoría
        const [tareaInfoAudit] = await pool.execute(
          `SELECT t.titulo, t.id_modulo, m.id_curso, c.nombre as curso_nombre
           FROM tareas_modulo t 
           JOIN modulos_curso m ON t.id_modulo = m.id_modulo
           JOIN cursos c ON m.id_curso = c.id_curso
           WHERE t.id_tarea = ?`,
          [entrega.id_tarea]
        );

        if (tareaInfoAudit.length > 0) {
          await registrarAuditoria({
            tabla_afectada: 'entregas_tareas',
            operacion: 'UPDATE',
            id_registro: id,
            usuario_id: id_estudiante,
            datos_nuevos: {
              id_entrega: id,
              id_tarea: entrega.id_tarea,
              titulo_tarea: tareaInfoAudit[0].titulo,
              id_modulo: tareaInfoAudit[0].id_modulo,
              id_curso: tareaInfoAudit[0].id_curso,
              curso_nombre: tareaInfoAudit[0].curso_nombre,
              tiene_archivo_nuevo: archivoData ? true : false,
              comentario_estudiante: comentario_estudiante || null,
              accion: 're_entrega'
            },
            ip_address: req.ip || req.connection?.remoteAddress || null,
            user_agent: req.get('user-agent') || null
          });
        }
      } catch (auditError) {
        console.error('Error registrando auditoría de re-entrega (no afecta la re-entrega):', auditError);
      }

      // 🔥 Emitir evento WebSocket para notificar al docente
      const io = req.app.get('io');
      if (io) {
        // Obtener id_modulo de la tarea
        const { pool } = require('../config/database');
        const [tareaInfo] = await pool.execute(
          'SELECT id_modulo FROM tareas_modulo WHERE id_tarea = ?',
          [entrega.id_tarea]
        );
        const id_modulo = tareaInfo.length > 0 ? tareaInfo[0].id_modulo : null;

        io.emit('entrega_actualizada', {
          id_entrega: id,
          id_tarea: entrega.id_tarea,
          id_modulo,
          id_estudiante: entrega.id_estudiante,
          entrega
        });
        console.log(`[WebSocket] Entrega actualizada emitida: ID ${id} módulo ${id_modulo}`);
      }

      return res.json({
        success: true,
        message: 'Entrega actualizada exitosamente',
        entrega
      });
    } catch (error) {
      console.error('Error en updateEntrega:', error);
      return res.status(500).json({ error: 'Error actualizando entrega' });
    }
  });
}

// DELETE /api/entregas/:id - Eliminar entrega (solo si no está calificada)
async function deleteEntrega(req, res) {
  try {
    const { id } = req.params;
    const id_estudiante = req.user.id_usuario;

    // Verificar que la entrega pertenece al estudiante
    const belongsToEstudiante = await EntregasModel.belongsToEstudiante(id, id_estudiante);
    if (!belongsToEstudiante) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta entrega' });
    }

    // Verificar que no esté calificada
    const entrega = await EntregasModel.getById(id);
    if (!entrega) {
      return res.status(404).json({ error: 'Entrega no encontrada' });
    }

    if (entrega.calificacion !== null && entrega.calificacion !== undefined) {
      return res.status(400).json({ error: 'No puedes eliminar una entrega que ya ha sido calificada' });
    }

    // Eliminar la entrega
    const deleted = await EntregasModel.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Entrega no encontrada' });
    }

    return res.json({
      success: true,
      message: 'Entrega eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error en deleteEntrega:', error);
    return res.status(500).json({ error: 'Error eliminando entrega' });
  }
}

// NOTA: Los archivos ahora se sirven directamente desde Cloudinary
// Las URLs están disponibles en el campo archivo_url
// Esta función ya no es necesaria y debe ser eliminada de las rutas

// GET /api/entregas/estudiante/tarea/:id_tarea - Obtener entrega del estudiante en una tarea
async function getEntregaByTareaEstudiante(req, res) {
  try {
    const { id_tarea } = req.params;
    const id_estudiante = req.user.id_usuario;

    const entrega = await EntregasModel.getByTareaEstudiante(id_tarea, id_estudiante);

    return res.json({
      success: true,
      entrega
    });
  } catch (error) {
    console.error('Error en getEntregaByTareaEstudiante:', error);
    return res.status(500).json({ error: 'Error obteniendo entrega' });
  }
}

// POST /api/entregas/:id/calificar - Calificar entrega (docente)
async function calificarEntrega(req, res) {
  try {
    const { id } = req.params;
    const { nota, comentario_docente } = req.body;

    // Validaciones
    if (nota === undefined || nota === null) {
      return res.status(400).json({ error: 'La nota es obligatoria' });
    }

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(req.user.id_usuario);

    if (!id_docente) {
      return res.status(403).json({ error: 'Usuario no es docente' });
    }

    const id_calificacion = await CalificacionesModel.createOrUpdate({
      id_entrega: id,
      nota,
      comentario_docente,
      calificado_por: id_docente
    });

    const calificacion = await CalificacionesModel.getByEntrega(id);

    // Obtener datos de la entrega para notificar al estudiante
    const entrega = await EntregasModel.getById(id);

    // Registrar auditoría - Docente calificó tarea
    try {
      const { pool } = require('../config/database');
      
      // Obtener información completa para la auditoría
      const [infoCompleta] = await pool.execute(`
        SELECT 
          t.titulo as titulo_tarea,
          t.id_modulo,
          m.id_curso,
          c.nombre as curso_nombre,
          u_est.nombre as estudiante_nombre,
          u_est.apellido as estudiante_apellido
        FROM entregas_tareas e
        INNER JOIN tareas_modulo t ON e.id_tarea = t.id_tarea
        INNER JOIN modulos_curso m ON t.id_modulo = m.id_modulo
        INNER JOIN cursos c ON m.id_curso = c.id_curso
        INNER JOIN usuarios u_est ON e.id_estudiante = u_est.id_usuario
        WHERE e.id_entrega = ?
      `, [id]);

      if (infoCompleta.length > 0) {
        const info = infoCompleta[0];
        await registrarAuditoria({
          tabla_afectada: 'calificaciones_tareas',
          operacion: 'INSERT',
          id_registro: id_calificacion,
          usuario_id: req.user.id_usuario,
          datos_nuevos: {
            id_entrega: id,
            id_tarea: entrega.id_tarea,
            titulo_tarea: info.titulo_tarea,
            id_estudiante: entrega.id_estudiante,
            estudiante_nombre: `${info.estudiante_nombre} ${info.estudiante_apellido}`,
            id_curso: info.id_curso,
            curso_nombre: info.curso_nombre,
            nota,
            comentario_docente: comentario_docente || null,
            calificado_por: id_docente
          },
          ip_address: req.ip || req.connection?.remoteAddress || null,
          user_agent: req.get('user-agent') || null
        });
      }
    } catch (auditError) {
      console.error('Error registrando auditoría de calificación (no afecta la calificación):', auditError);
    }

    // Obtener información del docente y curso
    const { pool } = require('../config/database');
    const [infoCompleta] = await pool.execute(`
      SELECT 
        u.nombre as docente_nombre, 
        u.apellido as docente_apellido,
        c.nombre as curso_nombre
      FROM tareas_modulo t
      INNER JOIN modulos_curso m ON t.id_modulo = m.id_modulo
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN docentes d ON t.id_docente = d.id_docente
      INNER JOIN usuarios u ON d.identificacion = u.cedula
      WHERE t.id_tarea = ?
    `, [entrega.id_tarea]);

    const nombreDocente = infoCompleta[0]
      ? `${infoCompleta[0].docente_nombre} ${infoCompleta[0].docente_apellido}`
      : 'Docente';
    const nombreCurso = infoCompleta[0]?.curso_nombre || 'tu curso';

    // Notificar al estudiante que su tarea fue calificada
    notificarTareaCalificada(req, entrega.id_estudiante, {
      id_tarea: entrega.id_tarea,
      titulo: entrega.tarea_titulo,
      nota,
      id_curso: entrega.id_curso,
      docente_nombre: nombreDocente,
      curso_nombre: nombreCurso
    });

    return res.json({
      success: true,
      message: 'Entrega calificada exitosamente',
      calificacion
    });
  } catch (error) {
    console.error('Error en calificarEntrega:', error);
    return res.status(500).json({ error: error.message || 'Error calificando entrega' });
  }
}

module.exports = {
  getEntregasByTarea,
  getEntregaById,
  createEntrega,
  updateEntrega,
  deleteEntrega,
  getEntregaByTareaEstudiante,
  calificarEntrega
};
