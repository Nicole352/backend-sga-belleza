const { listCursos, getCursoById, createCurso, updateCurso, deleteCurso } = require('../models/cursos.model');

// GET /api/cursos
async function listCursosController(req, res) {
  try {
    const estado = req.query.estado; // si no viene, no filtrar por estado
    const tipo = req.query.tipo ? Number(req.query.tipo) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));

    const rows = await listCursos({ estado, tipo, page, limit });
    return res.json(rows);
  } catch (err) {
    console.error('Error listando cursos:', err);
    return res.status(500).json({ error: 'Error al listar cursos' });
  }
}

// GET /api/cursos/:id
async function getCursoController(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const curso = await getCursoById(id);
    if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
    return res.json(curso);
  } catch (err) {
    console.error('Error obteniendo curso:', err);
    return res.status(500).json({ error: 'Error al obtener el curso' });
  }
}

module.exports = {
  listCursosController,
  getCursoController,
  async createCursoController(req, res) {
    try {
      const result = await createCurso(req.body || {});
      return res.status(201).json(result);
    } catch (err) {
      console.error('Error creando curso:', err);
      return res.status(400).json({ error: err.message || 'Error al crear curso' });
    }
  },
  async updateCursoController(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const affected = await updateCurso(id, req.body || {});
      if (affected === 0) return res.status(404).json({ error: 'Curso no encontrado o sin cambios' });
      
      // Devolver el curso actualizado en lugar de solo { ok: true }
      const updatedCurso = await getCursoById(id);
      return res.json(updatedCurso);
    } catch (err) {
      console.error('Error actualizando curso:', err);
      return res.status(400).json({ error: err.message || 'Error al actualizar curso' });
    }
  },
  async deleteCursoController(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const affected = await deleteCurso(id);
      if (affected === 0) return res.status(404).json({ error: 'Curso no encontrado' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('Error eliminando curso:', err);
      return res.status(500).json({ error: 'Error al eliminar curso' });
    }
  }
};
