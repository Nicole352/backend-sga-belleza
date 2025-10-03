const AsignacionesAulasModel = require('../models/asignaciones-aulas.model');

class AsignacionesAulasController {
  // Obtener todas las asignaciones
  static async getAsignaciones(req, res) {
    try {
      const { page, limit, estado, id_aula, id_curso, id_docente } = req.query;
      
      const filters = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        estado: estado || '',
        id_aula: id_aula || '',
        id_curso: id_curso || '',
        id_docente: id_docente || ''
      };

      const result = await AsignacionesAulasModel.getAll(filters);
      
      return res.json(result);
    } catch (error) {
      console.error('Error obteniendo asignaciones:', error);
      return res.status(500).json({ error: 'Error obteniendo asignaciones' });
    }
  }

  // Obtener asignación por ID
  static async getAsignacionById(req, res) {
    try {
      const { id } = req.params;
      
      const asignacion = await AsignacionesAulasModel.getById(id);
      
      if (!asignacion) {
        return res.status(404).json({ error: 'Asignación no encontrada' });
      }
      
      return res.json(asignacion);
    } catch (error) {
      console.error('Error obteniendo asignación:', error);
      return res.status(500).json({ error: 'Error obteniendo asignación' });
    }
  }

  // Crear nueva asignación
  static async createAsignacion(req, res) {
    try {
      const {
        id_aula,
        id_curso,
        id_docente,
        hora_inicio,
        hora_fin,
        dias,
        observaciones
      } = req.body;

      // Validaciones
      if (!id_aula || !id_curso || !id_docente || !hora_inicio || !hora_fin || !dias) {
        return res.status(400).json({ 
          error: 'Faltan campos obligatorios: id_aula, id_curso, id_docente, hora_inicio, hora_fin, dias' 
        });
      }

      // Validar formato de hora
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
      if (!timeRegex.test(hora_inicio) || !timeRegex.test(hora_fin)) {
        return res.status(400).json({ 
          error: 'Formato de hora inválido. Use HH:MM:SS' 
        });
      }

      // Validar que hora_fin > hora_inicio
      if (hora_fin <= hora_inicio) {
        return res.status(400).json({ 
          error: 'La hora de fin debe ser mayor a la hora de inicio' 
        });
      }

      // Validar formato de días (debe ser string separado por comas)
      if (typeof dias !== 'string' || dias.trim() === '') {
        return res.status(400).json({ 
          error: 'El campo días debe ser un string separado por comas (ej: Lunes,Miércoles,Viernes)' 
        });
      }

      const asignacionData = {
        id_aula: parseInt(id_aula),
        id_curso: parseInt(id_curso),
        id_docente: parseInt(id_docente),
        hora_inicio,
        hora_fin,
        dias: dias.trim(),
        observaciones: observaciones || null
      };

      const id_asignacion = await AsignacionesAulasModel.create(asignacionData);
      
      // Obtener la asignación creada con todos los datos
      const asignacionCreada = await AsignacionesAulasModel.getById(id_asignacion);
      
      return res.status(201).json({
        message: 'Asignación creada exitosamente',
        asignacion: asignacionCreada
      });
    } catch (error) {
      console.error('Error creando asignación:', error);
      
      if (error.message.includes('Conflicto de horario')) {
        return res.status(409).json({ error: error.message });
      }
      
      if (error.message.includes('no existe') || error.message.includes('no está disponible')) {
        return res.status(400).json({ error: error.message });
      }
      
      return res.status(500).json({ error: 'Error creando asignación' });
    }
  }

  // Actualizar asignación
  static async updateAsignacion(req, res) {
    try {
      const { id } = req.params;
      const {
        id_aula,
        id_curso,
        id_docente,
        hora_inicio,
        hora_fin,
        dias,
        estado,
        observaciones
      } = req.body;

      // Validar que la asignación existe
      const asignacionExistente = await AsignacionesAulasModel.getById(id);
      if (!asignacionExistente) {
        return res.status(404).json({ error: 'Asignación no encontrada' });
      }

      // Validar formato de hora si se proporciona
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
      if (hora_inicio && !timeRegex.test(hora_inicio)) {
        return res.status(400).json({ error: 'Formato de hora_inicio inválido. Use HH:MM:SS' });
      }
      if (hora_fin && !timeRegex.test(hora_fin)) {
        return res.status(400).json({ error: 'Formato de hora_fin inválido. Use HH:MM:SS' });
      }

      // Validar que hora_fin > hora_inicio si ambos se proporcionan
      const horaInicioFinal = hora_inicio || asignacionExistente.hora_inicio;
      const horaFinFinal = hora_fin || asignacionExistente.hora_fin;
      
      if (horaFinFinal <= horaInicioFinal) {
        return res.status(400).json({ 
          error: 'La hora de fin debe ser mayor a la hora de inicio' 
        });
      }

      // Validar estado si se proporciona
      if (estado && !['activa', 'inactiva', 'cancelada'].includes(estado)) {
        return res.status(400).json({ 
          error: 'Estado inválido. Use: activa, inactiva, cancelada' 
        });
      }

      const asignacionData = {};
      
      if (id_aula !== undefined) asignacionData.id_aula = parseInt(id_aula);
      if (id_curso !== undefined) asignacionData.id_curso = parseInt(id_curso);
      if (id_docente !== undefined) asignacionData.id_docente = parseInt(id_docente);
      if (hora_inicio !== undefined) asignacionData.hora_inicio = hora_inicio;
      if (hora_fin !== undefined) asignacionData.hora_fin = hora_fin;
      if (dias !== undefined) asignacionData.dias = dias.trim();
      if (estado !== undefined) asignacionData.estado = estado;
      if (observaciones !== undefined) asignacionData.observaciones = observaciones;

      const affectedRows = await AsignacionesAulasModel.update(id, asignacionData);
      
      if (affectedRows === 0) {
        return res.status(404).json({ error: 'No se pudo actualizar la asignación' });
      }

      // Obtener la asignación actualizada
      const asignacionActualizada = await AsignacionesAulasModel.getById(id);
      
      return res.json({
        message: 'Asignación actualizada exitosamente',
        asignacion: asignacionActualizada
      });
    } catch (error) {
      console.error('Error actualizando asignación:', error);
      
      if (error.message.includes('Conflicto de horario')) {
        return res.status(409).json({ error: error.message });
      }
      
      return res.status(500).json({ error: 'Error actualizando asignación' });
    }
  }

  // Eliminar asignación (soft delete)
  static async deleteAsignacion(req, res) {
    try {
      const { id } = req.params;
      
      const affectedRows = await AsignacionesAulasModel.delete(id);
      
      if (affectedRows === 0) {
        return res.status(404).json({ error: 'Asignación no encontrada' });
      }
      
      return res.json({ message: 'Asignación cancelada exitosamente' });
    } catch (error) {
      console.error('Error eliminando asignación:', error);
      return res.status(500).json({ error: 'Error eliminando asignación' });
    }
  }

  // Obtener asignaciones por aula
  static async getAsignacionesByAula(req, res) {
    try {
      const { id_aula } = req.params;
      
      const asignaciones = await AsignacionesAulasModel.getByAula(id_aula);
      
      return res.json(asignaciones);
    } catch (error) {
      console.error('Error obteniendo asignaciones por aula:', error);
      return res.status(500).json({ error: 'Error obteniendo asignaciones' });
    }
  }

  // Obtener asignaciones por docente
  static async getAsignacionesByDocente(req, res) {
    try {
      const { id_docente } = req.params;
      
      const asignaciones = await AsignacionesAulasModel.getByDocente(id_docente);
      
      return res.json(asignaciones);
    } catch (error) {
      console.error('Error obteniendo asignaciones por docente:', error);
      return res.status(500).json({ error: 'Error obteniendo asignaciones' });
    }
  }

  // Verificar disponibilidad de aula
  static async verificarDisponibilidad(req, res) {
    try {
      const { id_aula, hora_inicio, hora_fin, dias, exclude_id } = req.query;
      
      if (!id_aula || !hora_inicio || !hora_fin || !dias) {
        return res.status(400).json({ 
          error: 'Faltan parámetros: id_aula, hora_inicio, hora_fin, dias' 
        });
      }

      const conflictos = await AsignacionesAulasModel.verificarConflictos(
        id_aula,
        hora_inicio,
        hora_fin,
        dias,
        exclude_id || null
      );
      
      return res.json({
        disponible: conflictos.length === 0,
        conflictos: conflictos
      });
    } catch (error) {
      console.error('Error verificando disponibilidad:', error);
      return res.status(500).json({ error: 'Error verificando disponibilidad' });
    }
  }

  // Obtener estadísticas
  static async getEstadisticas(req, res) {
    try {
      const stats = await AsignacionesAulasModel.getStats();
      
      return res.json(stats);
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }
  }
}

module.exports = AsignacionesAulasController;
