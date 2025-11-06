const EntregasModel = require('../models/entregas.model');
const CalificacionesModel = require('../models/calificaciones.model');
const DocentesModel = require('../models/docentes.model');
const multer = require('multer');

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

      // Procesar archivo si existe
      let archivoData = null;
      if (req.file) {
        archivoData = {
          buffer: req.file.buffer,
          mime: req.file.mimetype,
          sizeKb: Math.round(req.file.size / 1024),
          nombreOriginal: req.file.originalname
        };
      }

      const id_entrega = await EntregasModel.create({
        id_tarea,
        id_estudiante,
        comentario_estudiante
      }, archivoData);

      const entrega = await EntregasModel.getById(id_entrega);

      // 🔥 Emitir evento WebSocket para notificar al docente y actualizar estudiante
      const io = req.app.get('io');
      if (io) {
        // Obtener id_modulo de la tarea para facilitar la actualización en frontend
        const { pool } = require('../config/database');
        const [tareaInfo] = await pool.execute(
          'SELECT id_modulo FROM tareas_modulo WHERE id_tarea = ?',
          [id_tarea]
        );
        const id_modulo = tareaInfo.length > 0 ? tareaInfo[0].id_modulo : null;
        
        // Notificar al docente
        io.emit('entrega_nueva', {
          id_entrega,
          id_tarea,
          id_modulo,
          id_estudiante,
          entrega
        });

        // Notificar al estudiante que su entrega fue exitosa
        io.to(`user_${id_estudiante}`).emit('tarea_entregada', {
          id_entrega,
          id_tarea,
          id_modulo,
          mensaje: 'Tarea entregada exitosamente'
        });
        
        console.log(`📢 [WebSocket] Nueva entrega emitida: ID ${id_entrega} para tarea ${id_tarea} módulo ${id_modulo}`);
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

      // Procesar archivo si existe
      let archivoData = null;
      if (req.file) {
        archivoData = {
          buffer: req.file.buffer,
          mime: req.file.mimetype,
          sizeKb: Math.round(req.file.size / 1024),
          nombreOriginal: req.file.originalname
        };
      }

      const updated = await EntregasModel.update(id, {
        comentario_estudiante
      }, archivoData);

      if (!updated) {
        return res.status(404).json({ error: 'Entrega no encontrada' });
      }

      const entrega = await EntregasModel.getById(id);

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
        console.log(`📢 [WebSocket] Entrega actualizada emitida: ID ${id} módulo ${id_modulo}`);
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

// GET /api/entregas/:id/archivo - Descargar archivo de entrega
async function getArchivoEntrega(req, res) {
  try {
    const { id } = req.params;

    const archivo = await EntregasModel.getArchivo(id);

    if (!archivo) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    res.setHeader('Content-Type', archivo.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${archivo.filename}"`);
    return res.send(archivo.buffer);
  } catch (error) {
    console.error('Error en getArchivoEntrega:', error);
    return res.status(500).json({ error: 'Error descargando archivo' });
  }
}

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

    const io = req.app.get('io');
    if (io) {
      const entrega = await EntregasModel.getById(id);
      
      // Emitir evento específico al estudiante
      io.to(`user_${entrega.id_estudiante}`).emit('tarea_calificada', {
        id_entrega: id,
        id_tarea: entrega.id_tarea,
        id_estudiante: entrega.id_estudiante,
        id_curso: entrega.id_curso,
        tarea_titulo: entrega.tarea_titulo,
        nota,
        comentario_docente,
        calificacion
      });
      
      // Evento general para docentes
      io.emit('entrega_calificada', {
        id_entrega: id,
        id_tarea: entrega.id_tarea,
        id_estudiante: entrega.id_estudiante,
        id_curso: entrega.id_curso,
        id_modulo: entrega.id_modulo,
        tarea_titulo: entrega.tarea_titulo,
        estudiante_nombre: entrega.estudiante_nombre,
        estudiante_apellido: entrega.estudiante_apellido,
        nota,
        comentario_docente,
        calificacion
      });
      
      console.log('📊 [WebSocket] Eventos de calificación emitidos:', {
        estudiante_notificado: entrega.id_estudiante,
        id_entrega: id,
        id_curso: entrega.id_curso
      });
    }

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
  getArchivoEntrega,
  getEntregaByTareaEstudiante,
  calificarEntrega
};
