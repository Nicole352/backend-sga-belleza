const TareasModel = require('../models/tareas.model');
const DocentesModel = require('../models/docentes.model');
const { registrarAuditoria } = require('../utils/auditoria');

// GET /api/tareas/modulo/:id_modulo - Obtener tareas de un módulo
async function getTareasByModulo(req, res) {
  try {
    const { id_modulo } = req.params;
    const { id_usuario, rol } = req.user;
    
    // Si es estudiante, obtener su id_estudiante y pasar al modelo
    let id_estudiante = null;
    if (rol === 'estudiante') {
      const EstudiantesModel = require('../models/estudiantes.model');
      id_estudiante = await EstudiantesModel.getEstudianteIdByUserId(id_usuario);
    }
    
    const tareas = await TareasModel.getAllByModulo(id_modulo, id_estudiante);
    
    // Formatear las tareas para incluir la entrega si existe
    const tareasFormateadas = tareas.map(tarea => {
      const tareaBase = {
        id_tarea: tarea.id_tarea,
        id_modulo: tarea.id_modulo,
        id_docente: tarea.id_docente,
        titulo: tarea.titulo,
        descripcion: tarea.descripcion,
        instrucciones: tarea.instrucciones,
        nota_maxima: tarea.nota_maxima,
        nota_minima_aprobacion: tarea.nota_minima_aprobacion,
        fecha_limite: tarea.fecha_limite,
        permite_archivo: tarea.permite_archivo,
        tamano_maximo_mb: tarea.tamano_maximo_mb,
        formatos_permitidos: tarea.formatos_permitidos,
        estado: tarea.estado,
        fecha_creacion: tarea.fecha_creacion,
        docente_nombres: tarea.docente_nombres,
        docente_apellidos: tarea.docente_apellidos,
        total_entregas: tarea.total_entregas,
        entregas_calificadas: tarea.entregas_calificadas
      };
      
      // Si hay entrega del estudiante, agregarla
      if (tarea.id_entrega) {
        tareaBase.entrega = {
          id_entrega: tarea.id_entrega,
          archivo_nombre: tarea.archivo_nombre,
          fecha_entrega: tarea.fecha_entrega,
          estado: tarea.entrega_estado,
          calificacion: tarea.calificacion,
          comentarios: tarea.calificacion_comentarios,
          fecha_calificacion: tarea.fecha_calificacion,
          calificador_nombres: tarea.calificador_nombres,
          calificador_apellidos: tarea.calificador_apellidos
        };
      }
      
      return tareaBase;
    });
    
    return res.json({
      success: true,
      tareas: tareasFormateadas
    });
  } catch (error) {
    console.error('Error en getTareasByModulo:', error);
    return res.status(500).json({ error: 'Error obteniendo tareas del módulo' });
  }
}

// GET /api/tareas/:id - Obtener tarea por ID
async function getTareaById(req, res) {
  try {
    const { id } = req.params;
    
    const tarea = await TareasModel.getById(id);
    
    if (!tarea) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    
    return res.json({
      success: true,
      tarea
    });
  } catch (error) {
    console.error('Error en getTareaById:', error);
    return res.status(500).json({ error: 'Error obteniendo tarea' });
  }
}

// POST /api/tareas - Crear nueva tarea
async function createTarea(req, res) {
  try {
    const {
      id_modulo,
      titulo,
      descripcion,
      instrucciones,
      nota_maxima,
      nota_minima_aprobacion,
      fecha_limite,
      permite_archivo,
      tamano_maximo_mb,
      formatos_permitidos
    } = req.body;

    // Validaciones
    if (!id_modulo || !titulo || !fecha_limite) {
      return res.status(400).json({ error: 'Módulo, título y fecha límite son obligatorios' });
    }

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(req.user.id_usuario);
    
    if (!id_docente) {
      return res.status(403).json({ error: 'Usuario no es docente' });
    }

    const id_tarea = await TareasModel.create({
      id_modulo,
      id_docente,
      titulo,
      descripcion,
      instrucciones,
      nota_maxima,
      nota_minima_aprobacion,
      fecha_limite,
      permite_archivo,
      tamano_maximo_mb,
      formatos_permitidos
    });

    const tarea = await TareasModel.getById(id_tarea);

    // Registrar auditoría
    await registrarAuditoria({
      tabla_afectada: 'tareas_modulo',
      operacion: 'INSERT',
      id_registro: id_tarea,
      usuario_id: req.user?.id_usuario,
      datos_nuevos: req.body,
      ip_address: req.ip || '0.0.0.0',
      user_agent: req.get('user-agent') || 'unknown'
    });

    return res.status(201).json({
      success: true,
      message: 'Tarea creada exitosamente',
      tarea
    });
  } catch (error) {
    console.error('Error en createTarea:', error);
    return res.status(500).json({ error: 'Error creando tarea' });
  }
}

// PUT /api/tareas/:id - Actualizar tarea
async function updateTarea(req, res) {
  try {
    const { id } = req.params;
    const {
      titulo,
      descripcion,
      instrucciones,
      nota_maxima,
      nota_minima_aprobacion,
      fecha_limite,
      permite_archivo,
      tamano_maximo_mb,
      formatos_permitidos,
      estado
    } = req.body;

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(req.user.id_usuario);
    
    if (!id_docente) {
      return res.status(403).json({ error: 'Usuario no es docente' });
    }

    // Verificar que la tarea pertenece al docente
    const belongsToDocente = await TareasModel.belongsToDocente(id, id_docente);
    if (!belongsToDocente) {
      return res.status(403).json({ error: 'No tienes permiso para modificar esta tarea' });
    }

    const updated = await TareasModel.update(id, {
      titulo,
      descripcion,
      instrucciones,
      nota_maxima,
      nota_minima_aprobacion,
      fecha_limite,
      permite_archivo,
      tamano_maximo_mb,
      formatos_permitidos,
      estado
    });

    if (!updated) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const tarea = await TareasModel.getById(id);

    return res.json({
      success: true,
      message: 'Tarea actualizada exitosamente',
      tarea
    });
  } catch (error) {
    console.error('Error en updateTarea:', error);
    return res.status(500).json({ error: 'Error actualizando tarea' });
  }
}

// DELETE /api/tareas/:id - Eliminar tarea
async function deleteTarea(req, res) {
  try {
    const { id } = req.params;

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(req.user.id_usuario);
    
    if (!id_docente) {
      return res.status(403).json({ error: 'Usuario no es docente' });
    }

    // Verificar que la tarea pertenece al docente
    const belongsToDocente = await TareasModel.belongsToDocente(id, id_docente);
    if (!belongsToDocente) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta tarea' });
    }

    const deleted = await TareasModel.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    return res.json({
      success: true,
      message: 'Tarea eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error en deleteTarea:', error);
    return res.status(500).json({ error: 'Error eliminando tarea' });
  }
}

// GET /api/tareas/:id/stats - Obtener estadísticas de la tarea
async function getTareaStats(req, res) {
  try {
    const { id } = req.params;
    
    const stats = await TareasModel.getStats(id);
    
    return res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error en getTareaStats:', error);
    return res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
}

// GET /api/tareas/estudiante/curso/:id_curso - Obtener tareas de un estudiante en un curso
async function getTareasByEstudiante(req, res) {
  try {
    const { id_curso } = req.params;
    const id_estudiante = req.user.id_usuario;
    
    const tareas = await TareasModel.getTareasByEstudiante(id_estudiante, id_curso);
    
    return res.json({
      success: true,
      tareas
    });
  } catch (error) {
    console.error('Error en getTareasByEstudiante:', error);
    return res.status(500).json({ error: 'Error obteniendo tareas del estudiante' });
  }
}

module.exports = {
  getTareasByModulo,
  getTareaById,
  createTarea,
  updateTarea,
  deleteTarea,
  getTareaStats,
  getTareasByEstudiante
};
