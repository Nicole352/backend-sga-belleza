const PromocionesModel = require('../models/promociones.model');
const { registrarAuditoria } = require('../utils/auditoria');

// Crear nueva promoción
exports.create = async (req, res) => {
  try {
    const {
      id_curso_principal,
      id_curso_promocional,
      nombre_promocion,
      descripcion,
      meses_gratis,
      clases_gratis,
      fecha_inicio,
      fecha_fin,
      cupos_disponibles
    } = req.body;

    // Validaciones
    if (!id_curso_principal || !id_curso_promocional || !nombre_promocion) {
      return res.status(400).json({ 
        error: 'Curso principal, curso promocional y nombre son obligatorios' 
      });
    }

    if (!meses_gratis && !clases_gratis) {
      return res.status(400).json({ 
        error: 'Debe especificar meses gratis o clases gratis' 
      });
    }

    const id_promocion = await PromocionesModel.create({
      id_curso_principal,
      id_curso_promocional,
      nombre_promocion,
      descripcion,
      meses_gratis,
      clases_gratis,
      fecha_inicio,
      fecha_fin,
      cupos_disponibles,
      created_by: req.user.id_usuario
    });

    // Auditoría con datos completos
    await registrarAuditoria({
      tabla_afectada: 'promociones',
      operacion: 'INSERT',
      id_registro: id_promocion,
      usuario_id: req.user.id_usuario,
      datos_nuevos: {
        id_promocion,
        nombre_promocion,
        descripcion,
        meses_gratis: meses_gratis || 0,
        clases_gratis: clases_gratis || 0,
        fecha_inicio,
        fecha_fin,
        cupos_disponibles,
        activa: true
      },
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    });

    res.status(201).json({
      success: true,
      message: 'Promoción creada exitosamente',
      id_promocion
    });

  } catch (error) {
    console.error('Error creando promoción:', error);
    res.status(500).json({ error: 'Error creando promoción' });
  }
};

// Obtener todas las promociones
exports.getAll = async (req, res) => {
  try {
    const promociones = await PromocionesModel.getAll();
    res.json(promociones);
  } catch (error) {
    console.error('Error obteniendo promociones:', error);
    res.status(500).json({ error: 'Error obteniendo promociones' });
  }
};

// Obtener promociones activas
exports.getActivas = async (req, res) => {
  try {
    const promociones = await PromocionesModel.getActivas();
    res.json(promociones);
  } catch (error) {
    console.error('Error obteniendo promociones activas:', error);
    res.status(500).json({ error: 'Error obteniendo promociones activas' });
  }
};

// Obtener promociones activas por curso
exports.getActivasByCurso = async (req, res) => {
  try {
    const { id_curso } = req.params;
    const promociones = await PromocionesModel.getActivasByCurso(id_curso);
    res.json(promociones);
  } catch (error) {
    console.error('Error obteniendo promociones del curso:', error);
    res.status(500).json({ error: 'Error obteniendo promociones del curso' });
  }
};

// Obtener promoción por ID
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const promocion = await PromocionesModel.getById(id);

    if (!promocion) {
      return res.status(404).json({ error: 'Promoción no encontrada' });
    }

    res.json(promocion);
  } catch (error) {
    console.error('Error obteniendo promoción:', error);
    res.status(500).json({ error: 'Error obteniendo promoción' });
  }
};

// Actualizar promoción
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre_promocion,
      descripcion,
      meses_gratis,
      fecha_inicio,
      fecha_fin,
      horarios_disponibles,
      cupos_disponibles,
      activa
    } = req.body;

    // Obtener datos anteriores para auditoría
    const promocionAnterior = await PromocionesModel.getById(id);
    if (!promocionAnterior) {
      return res.status(404).json({ error: 'Promoción no encontrada' });
    }

    await PromocionesModel.update(id, {
      nombre_promocion,
      descripcion,
      meses_gratis,
      fecha_inicio,
      fecha_fin,
      horarios_disponibles,
      cupos_disponibles,
      activa
    });

    // Auditoría
    await registrarAuditoria({
      tabla_afectada: 'promociones',
      operacion: 'UPDATE',
      id_registro: id,
      usuario_id: req.user.id_usuario,
      datos_anteriores: promocionAnterior,
      datos_nuevos: req.body,
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Promoción actualizada exitosamente'
    });

  } catch (error) {
    console.error('Error actualizando promoción:', error);
    res.status(500).json({ error: 'Error actualizando promoción' });
  }
};

// Activar/Desactivar promoción
exports.toggleActiva = async (req, res) => {
  try {
    const { id } = req.params;
    const { activa } = req.body;

    await PromocionesModel.toggleActiva(id, activa);

    // Auditoría
    await registrarAuditoria({
      tabla_afectada: 'promociones',
      operacion: 'UPDATE',
      id_registro: id,
      usuario_id: req.user.id_usuario,
      datos_nuevos: { activa },
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: `Promoción ${activa ? 'activada' : 'desactivada'} exitosamente`
    });

  } catch (error) {
    console.error('Error cambiando estado de promoción:', error);
    res.status(500).json({ error: 'Error cambiando estado de promoción' });
  }
};

// Eliminar promoción
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener datos para auditoría
    const promocion = await PromocionesModel.getById(id);
    if (!promocion) {
      return res.status(404).json({ error: 'Promoción no encontrada' });
    }

    await PromocionesModel.delete(id);

    // Auditoría
    await registrarAuditoria({
      tabla_afectada: 'promociones',
      operacion: 'DELETE',
      id_registro: id,
      usuario_id: req.user.id_usuario,
      datos_anteriores: promocion,
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Promoción eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando promoción:', error);
    res.status(500).json({ error: 'Error eliminando promoción' });
  }
};

// Aceptar promoción (usado por estudiantes)
exports.aceptarPromocion = async (req, res) => {
  try {
    const {
      id_promocion,
      horario_seleccionado
    } = req.body;

    const id_estudiante = req.user.id_usuario;

    // Validar que la promoción existe y está activa
    const promocion = await PromocionesModel.getById(id_promocion);
    if (!promocion) {
      return res.status(404).json({ error: 'Promoción no encontrada' });
    }

    if (!promocion.activa) {
      return res.status(400).json({ error: 'La promoción no está activa' });
    }

    // Verificar cupos
    if (promocion.cupos_disponibles !== null && 
        promocion.cupos_utilizados >= promocion.cupos_disponibles) {
      return res.status(400).json({ error: 'No hay cupos disponibles para esta promoción' });
    }

    // Verificar que el estudiante no haya aceptado ya esta promoción
    const yaAcepto = await PromocionesModel.estudianteTienePromocion(
      id_estudiante, 
      promocion.id_curso
    );

    if (yaAcepto) {
      return res.status(400).json({ 
        error: 'Ya has aceptado una promoción para este curso' 
      });
    }

    // Calcular fecha de inicio de cobro
    const fecha_inicio_cobro = new Date();
    fecha_inicio_cobro.setMonth(fecha_inicio_cobro.getMonth() + parseInt(promocion.meses_gratis));

    const id_estudiante_promocion = await PromocionesModel.aceptarPromocion({
      id_estudiante,
      id_promocion,
      horario_seleccionado,
      meses_gratis_aplicados: promocion.meses_gratis,
      fecha_inicio_cobro: fecha_inicio_cobro.toISOString().split('T')[0]
    });

    res.json({
      success: true,
      message: 'Promoción aceptada exitosamente',
      id_estudiante_promocion,
      meses_gratis: promocion.meses_gratis,
      fecha_inicio_cobro
    });

  } catch (error) {
    console.error('Error aceptando promoción:', error);
    res.status(500).json({ error: 'Error aceptando promoción' });
  }
};

// Obtener estadísticas de una promoción
exports.getEstadisticas = async (req, res) => {
  try {
    const { id } = req.params;
    const estadisticas = await PromocionesModel.getEstadisticas(id);
    res.json(estadisticas);
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
};
