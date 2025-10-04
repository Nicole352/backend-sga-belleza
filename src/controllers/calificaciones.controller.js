const CalificacionesModel = require('../models/calificaciones.model');

// GET /api/calificaciones/estudiante/curso/:id_curso - Obtener calificaciones de un estudiante en un curso
async function getCalificacionesByEstudianteCurso(req, res) {
  try {
    const { id_curso } = req.params;
    const id_estudiante = req.user.id_usuario;
    
    const calificaciones = await CalificacionesModel.getByEstudianteCurso(id_estudiante, id_curso);
    
    return res.json({
      success: true,
      calificaciones
    });
  } catch (error) {
    console.error('Error en getCalificacionesByEstudianteCurso:', error);
    return res.status(500).json({ error: 'Error obteniendo calificaciones' });
  }
}

// GET /api/calificaciones/promedio/modulo/:id_modulo - Obtener promedio de un módulo
async function getPromedioModulo(req, res) {
  try {
    const { id_modulo } = req.params;
    const id_estudiante = req.user.id_usuario;
    
    const promedio = await CalificacionesModel.getPromedioModulo(id_estudiante, id_modulo);
    
    return res.json({
      success: true,
      promedio
    });
  } catch (error) {
    console.error('Error en getPromedioModulo:', error);
    return res.status(500).json({ error: 'Error obteniendo promedio' });
  }
}

// GET /api/calificaciones/promedio/curso/:id_curso - Obtener promedio general del curso
async function getPromedioCurso(req, res) {
  try {
    const { id_curso } = req.params;
    const id_estudiante = req.user.id_usuario;
    
    const promedio = await CalificacionesModel.getPromedioCurso(id_estudiante, id_curso);
    
    return res.json({
      success: true,
      promedio
    });
  } catch (error) {
    console.error('Error en getPromedioCurso:', error);
    return res.status(500).json({ error: 'Error obteniendo promedio' });
  }
}

// GET /api/calificaciones/entrega/:id_entrega - Obtener calificación de una entrega
async function getCalificacionByEntrega(req, res) {
  try {
    const { id_entrega } = req.params;
    
    const calificacion = await CalificacionesModel.getByEntrega(id_entrega);
    
    return res.json({
      success: true,
      calificacion
    });
  } catch (error) {
    console.error('Error en getCalificacionByEntrega:', error);
    return res.status(500).json({ error: 'Error obteniendo calificación' });
  }
}

module.exports = {
  getCalificacionesByEstudianteCurso,
  getPromedioModulo,
  getPromedioCurso,
  getCalificacionByEntrega
};
