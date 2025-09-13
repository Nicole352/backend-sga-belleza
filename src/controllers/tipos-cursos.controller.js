const { pool } = require('../config/database');

// Helper: slugify simple para generar card_key
function slugify(v = '') {
  return String(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

exports.listTiposCursos = async (req, res) => {
  try {
    const estado = req.query.estado;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    let sql = `SELECT id_tipo_curso, nombre, descripcion, duracion_meses, precio_base, estado, card_key FROM tipos_cursos WHERE 1=1`;
    const params = [];
    if (estado) { sql += ' AND estado = ?'; params.push(estado); }
    // Evitar placeholder en LIMIT para compatibilidad
    sql += ` ORDER BY nombre ASC LIMIT ${limit}`;
    const [rows] = await pool.execute(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error('Error listando tipos de curso:', err);
    return res.status(500).json({ error: 'Error al listar tipos de curso' });
  }
};

exports.createTipoCurso = async (req, res) => {
  try {
    const { nombre, descripcion, duracion_meses, precio_base, estado, card_key } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });
    const computedKey = card_key ? slugify(card_key) : slugify(nombre);
    const sql = `INSERT INTO tipos_cursos (nombre, descripcion, duracion_meses, precio_base, estado, card_key) VALUES (?, ?, ?, ?, ?, ?)`;
    const params = [nombre, descripcion || null, duracion_meses ?? null, precio_base ?? null, estado || 'activo', computedKey || null];
    const [result] = await pool.execute(sql, params);
    const [rows] = await pool.execute('SELECT id_tipo_curso, nombre, descripcion, duracion_meses, precio_base, estado, card_key FROM tipos_cursos WHERE id_tipo_curso = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creando tipo de curso:', err);
    let msg = 'Error al crear tipo de curso';
    if (err && err.code === 'ER_DUP_ENTRY') msg = 'Nombre ya existe';
    return res.status(500).json({ error: msg });
  }
};

exports.updateTipoCurso = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const { nombre, descripcion, duracion_meses, precio_base, estado, card_key } = req.body;

    // Leer actual para decidir si auto-generar card_key cuando no viene y está nulo
    const [existingRows] = await pool.execute('SELECT card_key FROM tipos_cursos WHERE id_tipo_curso = ?', [id]);
    if (!existingRows.length) return res.status(404).json({ error: 'Tipo de curso no encontrado' });
    const existing = existingRows[0];

    let newCardKey = null;
    if (card_key) {
      newCardKey = slugify(card_key);
    } else if (!existing.card_key && nombre) {
      // Solo auto-generar si aún no tiene card_key y se recibe un nuevo nombre
      newCardKey = slugify(nombre);
    } // si ya existe card_key y no se envía, mantener

    const sql = `UPDATE tipos_cursos SET nombre = COALESCE(?, nombre), descripcion = COALESCE(?, descripcion), duracion_meses = COALESCE(?, duracion_meses), precio_base = COALESCE(?, precio_base), estado = COALESCE(?, estado), card_key = COALESCE(?, card_key) WHERE id_tipo_curso = ?`;
    const params = [nombre ?? null, descripcion ?? null, duracion_meses ?? null, precio_base ?? null, estado ?? null, newCardKey ?? null, id];
    const [result] = await pool.execute(sql, params);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Tipo de curso no encontrado' });
    const [rows] = await pool.execute('SELECT id_tipo_curso, nombre, descripcion, duracion_meses, precio_base, estado, card_key FROM tipos_cursos WHERE id_tipo_curso = ?', [id]);
    return res.json(rows[0]);
  } catch (err) {
    console.error('Error actualizando tipo de curso:', err);
    let msg = 'Error al actualizar tipo de curso';
    if (err && err.code === 'ER_DUP_ENTRY') msg = 'Nombre ya existe';
    return res.status(500).json({ error: msg });
  }
};

exports.deleteTipoCurso = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const [result] = await pool.execute('DELETE FROM tipos_cursos WHERE id_tipo_curso = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Tipo de curso no encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error eliminando tipo de curso:', err);
    const msg = err && err.code === 'ER_ROW_IS_REFERENCED_2' ? 'No se puede eliminar: existen cursos asociados' : 'Error al eliminar tipo de curso';
    return res.status(500).json({ error: msg });
  }
};
