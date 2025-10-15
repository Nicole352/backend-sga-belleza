const auditoriaModel = require('../models/auditoria.model');

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

module.exports = {
  listarAuditorias,
  obtenerDetalleAuditoria,
  obtenerAuditoriasPorUsuario,
  obtenerAuditoriasPorTabla,
  obtenerEstadisticas,
  obtenerTablasUnicas
};
