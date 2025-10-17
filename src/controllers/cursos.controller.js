const { listCursos, getCursoById, createCurso, updateCurso, deleteCurso } = require('../models/cursos.model');
const { pool } = require('../config/database');
const { registrarAuditoria } = require('../utils/auditoria');

// Caché simple para cursos disponibles (30 segundos) 
let cursosDisponiblesCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30000; // 30 segundos

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

// GET /api/cursos/disponibles - Obtener cursos con cupos disponibles agrupados por tipo y horario
async function getCursosDisponiblesController(req, res) {
  try {
    const now = Date.now();
    
    // Si el caché es válido, devolver datos cacheados
    if (cursosDisponiblesCache && (now - cacheTimestamp) < CACHE_DURATION) {
      console.log('✅ Devolviendo cursos desde caché');
      return res.json(cursosDisponiblesCache);
    }

    // Si no hay caché o expiró, consultar BD
    const [cursos] = await pool.execute(`
      SELECT 
        tc.id_tipo_curso,
        tc.nombre AS tipo_curso_nombre,
        tc.card_key,
        c.horario,
        COUNT(DISTINCT c.id_curso) AS cursos_activos,
        COALESCE(SUM(c.cupos_disponibles), 0) AS cupos_totales,
        COALESCE(SUM(c.capacidad_maxima), 0) AS capacidad_total
      FROM tipos_cursos tc
      INNER JOIN cursos c ON c.id_tipo_curso = tc.id_tipo_curso 
        AND c.estado = 'activo'
        AND c.horario IS NOT NULL
      WHERE tc.estado = 'activo'
      GROUP BY tc.id_tipo_curso, tc.nombre, tc.card_key, c.horario
      HAVING cursos_activos > 0
      ORDER BY tc.nombre, c.horario
    `);

    // Actualizar caché
    cursosDisponiblesCache = cursos;
    cacheTimestamp = now;

    console.log('📊 Endpoint /disponibles devuelve (desde BD):', JSON.stringify(cursos, null, 2));
    return res.json(cursos);
  } catch (err) {
    console.error('Error obteniendo cursos disponibles:', err);
    return res.status(500).json({ error: 'Error al obtener cursos disponibles' });
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

// POST /api/cursos
async function createCursoController(req, res) {
  try {
    const result = await createCurso(req.body || {});
    
    // Registrar auditoría
    await registrarAuditoria({
      tabla_afectada: 'cursos',
      operacion: 'INSERT',
      id_registro: result.id_curso,
      usuario_id: req.user?.id_usuario,
      datos_nuevos: req.body,
      ip_address: req.ip || '0.0.0.0',
      user_agent: req.get('user-agent') || 'unknown'
    });
    
    return res.status(201).json(result);
  } catch (err) {
    console.error('Error creando curso:', err);
    return res.status(400).json({ error: err.message || 'Error al crear curso' });
  }
}

// PUT /api/cursos/:id
async function updateCursoController(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    
    // Obtener datos anteriores
    const cursoAnterior = await getCursoById(id);
    
    const affected = await updateCurso(id, req.body || {});
    if (affected === 0) return res.status(404).json({ error: 'Curso no encontrado o sin cambios' });
    
    // Registrar auditoría
    await registrarAuditoria({
      tabla_afectada: 'cursos',
      operacion: 'UPDATE',
      id_registro: id,
      usuario_id: req.user?.id_usuario,
      datos_anteriores: cursoAnterior,
      datos_nuevos: req.body,
      ip_address: req.ip || '0.0.0.0',
      user_agent: req.get('user-agent') || 'unknown'
    });
    
    // Devolver el curso actualizado en lugar de solo { ok: true }
    const updatedCurso = await getCursoById(id);
    return res.json(updatedCurso);
  } catch (err) {
    console.error('Error actualizando curso:', err);
    return res.status(400).json({ error: err.message || 'Error al actualizar curso' });
  }
}

// DELETE /api/cursos/:id
async function deleteCursoController(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const affected = await deleteCurso(id);
    if (affected === 0) return res.status(404).json({ error: 'Curso no encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error eliminando curso:', err);
    return res.status(400).json({ error: err.message || 'Error al eliminar curso' });
  }
}

module.exports = {
  listCursosController,
  getCursosDisponiblesController,
  getCursoController,
  createCursoController,
  updateCursoController,
  deleteCursoController,
  // Nuevos handlers para datos académicos por curso
  async getEstudiantesByCursoController(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'ID inválido' });

      const [rows] = await pool.execute(`
        SELECT 
          u.id_usuario AS id_estudiante,
          u.nombre,
          u.apellido,
          u.email
        FROM matriculas m
        INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
        INNER JOIN roles r ON u.id_rol = r.id_rol AND r.nombre_rol = 'estudiante'
        WHERE m.id_curso = ? AND m.estado = 'activa'
        ORDER BY u.apellido, u.nombre
      `, [id]);

      return res.json({ success: true, estudiantes: rows });
    } catch (err) {
      console.error('Error obteniendo estudiantes del curso:', err);
      return res.status(500).json({ error: 'Error al obtener estudiantes del curso' });
    }
  },

  async getTareasByCursoController(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'ID inválido' });

      const [rows] = await pool.execute(`
        SELECT 
          t.id_tarea,
          t.titulo,
          t.nota_maxima,
          t.fecha_limite,
          m.id_modulo,
          m.nombre AS modulo_nombre,
          m.numero_orden AS modulo_orden
        FROM modulos_curso m
        INNER JOIN tareas_modulo t ON m.id_modulo = t.id_modulo
        WHERE m.id_curso = ? AND t.estado = 'activo'
        ORDER BY m.numero_orden ASC, t.fecha_limite ASC
      `, [id]);

      return res.json({ success: true, tareas: rows });
    } catch (err) {
      console.error('Error obteniendo tareas del curso:', err);
      return res.status(500).json({ error: 'Error al obtener tareas del curso' });
    }
  },

  async getCalificacionesByCursoController(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'ID inválido' });

      const [rows] = await pool.execute(`
        SELECT 
          e.id_estudiante,
          t.id_tarea,
          cal.nota AS nota_obtenida
        FROM modulos_curso m
        INNER JOIN tareas_modulo t ON m.id_modulo = t.id_modulo
        LEFT JOIN entregas_tareas e ON t.id_tarea = e.id_tarea
        LEFT JOIN calificaciones_tareas cal ON e.id_entrega = cal.id_entrega
        WHERE m.id_curso = ?
      `, [id]);

      return res.json({ success: true, calificaciones: rows });
    } catch (err) {
      console.error('Error obteniendo calificaciones del curso:', err);
      return res.status(500).json({ error: 'Error al obtener calificaciones del curso' });
    }
  }
};
