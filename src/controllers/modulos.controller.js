const ModulosModel = require('../models/modulos.model');
const DocentesModel = require('../models/docentes.model');
const { registrarAuditoria } = require('../utils/auditoria');

// GET /api/modulos/curso/:id_curso - Obtener módulos de un curso
async function getModulosByCurso(req, res) {
  try {
    const { id_curso } = req.params;
    
    const modulos = await ModulosModel.getAllByCurso(id_curso);
    
    return res.json({
      success: true,
      modulos
    });
  } catch (error) {
    console.error('Error en getModulosByCurso:', error);
    return res.status(500).json({ error: 'Error obteniendo módulos del curso' });
  }
}

// GET /api/modulos/:id - Obtener módulo por ID
async function getModuloById(req, res) {
  try {
    const { id } = req.params;
    
    const modulo = await ModulosModel.getById(id);
    
    if (!modulo) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }
    
    return res.json({
      success: true,
      modulo
    });
  } catch (error) {
    console.error('Error en getModuloById:', error);
    return res.status(500).json({ error: 'Error obteniendo módulo' });
  }
}

// POST /api/modulos - Crear nuevo módulo
async function createModulo(req, res) {
  try {
    const {
      id_curso,
      nombre,
      descripcion,
      numero_orden,
      fecha_inicio,
      fecha_fin
    } = req.body;

    // Validaciones
    if (!id_curso || !nombre) {
      return res.status(400).json({ error: 'Curso y nombre son obligatorios' });
    }

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(req.user.id_usuario);
    
    if (!id_docente) {
      return res.status(403).json({ error: 'Usuario no es docente' });
    }

    // Si no se proporciona número de orden, obtener el siguiente disponible
    let orden = numero_orden;
    if (!orden) {
      orden = await ModulosModel.getNextOrden(id_curso);
    } else {
      // Verificar que no exista otro módulo con el mismo orden
      const existeOrden = await ModulosModel.existsOrden(id_curso, orden);
      if (existeOrden) {
        return res.status(400).json({ error: 'Ya existe un módulo con ese número de orden' });
      }
    }

    const id_modulo = await ModulosModel.create({
      id_curso,
      id_docente,
      nombre,
      descripcion,
      numero_orden: orden,
      fecha_inicio,
      fecha_fin
    });

    const modulo = await ModulosModel.getById(id_modulo);

    // Registrar auditoría
    await registrarAuditoria({
      tabla_afectada: 'modulos_curso',
      operacion: 'INSERT',
      id_registro: id_modulo,
      usuario_id: req.user?.id_usuario,
      datos_nuevos: req.body,
      ip_address: req.ip || '0.0.0.0',
      user_agent: req.get('user-agent') || 'unknown'
    });

    return res.status(201).json({
      success: true,
      message: 'Módulo creado exitosamente',
      modulo
    });
  } catch (error) {
    console.error('Error en createModulo:', error);
    return res.status(500).json({ error: 'Error creando módulo' });
  }
}

// PUT /api/modulos/:id - Actualizar módulo
async function updateModulo(req, res) {
  try {
    const { id } = req.params;
    const {
      nombre,
      descripcion,
      numero_orden,
      fecha_inicio,
      fecha_fin,
      estado
    } = req.body;

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(req.user.id_usuario);
    
    if (!id_docente) {
      return res.status(403).json({ error: 'Usuario no es docente' });
    }

    // Verificar que el módulo pertenece al docente
    const belongsToDocente = await ModulosModel.belongsToDocente(id, id_docente);
    if (!belongsToDocente) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este módulo' });
    }

    // Si se cambia el orden, verificar que no exista otro módulo con ese orden
    if (numero_orden) {
      const modulo = await ModulosModel.getById(id);
      const existeOrden = await ModulosModel.existsOrden(modulo.id_curso, numero_orden, id);
      if (existeOrden) {
        return res.status(400).json({ error: 'Ya existe un módulo con ese número de orden' });
      }
    }

    const updated = await ModulosModel.update(id, {
      nombre,
      descripcion,
      numero_orden,
      fecha_inicio,
      fecha_fin,
      estado
    });

    if (!updated) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }

    const modulo = await ModulosModel.getById(id);

    return res.json({
      success: true,
      message: 'Módulo actualizado exitosamente',
      modulo
    });
  } catch (error) {
    console.error('Error en updateModulo:', error);
    return res.status(500).json({ error: 'Error actualizando módulo' });
  }
}

// DELETE /api/modulos/:id - Eliminar módulo
async function deleteModulo(req, res) {
  try {
    const { id } = req.params;

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(req.user.id_usuario);
    
    if (!id_docente) {
      return res.status(403).json({ error: 'Usuario no es docente' });
    }

    // Verificar que el módulo pertenece al docente
    const belongsToDocente = await ModulosModel.belongsToDocente(id, id_docente);
    if (!belongsToDocente) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este módulo' });
    }

    const deleted = await ModulosModel.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Módulo no encontrado' });
    }

    return res.json({
      success: true,
      message: 'Módulo eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error en deleteModulo:', error);
    return res.status(500).json({ error: 'Error eliminando módulo' });
  }
}

// GET /api/modulos/:id/stats - Obtener estadísticas del módulo
async function getModuloStats(req, res) {
  try {
    const { id } = req.params;
    
    const stats = await ModulosModel.getStats(id);
    
    return res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error en getModuloStats:', error);
    return res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
}

module.exports = {
  getModulosByCurso,
  getModuloById,
  createModulo,
  updateModulo,
  deleteModulo,
  getModuloStats
};
