const { pool } = require('../config/database');

exports.listAulas = async (req, res) => {
  try {
    const estado = req.query.estado;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    let sql = `SELECT id_aula, nombre, capacidad, ubicacion, estado FROM aulas WHERE 1=1`;
    const params = [];
    if (estado) { sql += ' AND estado = ?'; params.push(estado); }
    // Evitar placeholder en LIMIT por compatibilidad
    sql += ` ORDER BY nombre ASC LIMIT ${limit}`;
    const [rows] = await pool.execute(sql, params);
    return res.json(rows);
  } catch (err) {
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || /doesn't exist/i.test(err.sqlMessage || ''))) {
      // Si la tabla no existe, devolvemos lista vacía para no romper el frontend
      return res.json([]);
    }
    console.error('Error listando aulas:', err);
    return res.status(500).json({ error: 'Error al listar aulas' });
  }
};

exports.createAula = async (req, res) => {
  try {
    const { nombre, capacidad, ubicacion, estado } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });
    const sql = `INSERT INTO aulas (nombre, capacidad, ubicacion, estado) VALUES (?, ?, ?, ?)`;
    const params = [nombre, Number(capacidad) || 20, ubicacion || null, estado || 'disponible'];
    const [result] = await pool.execute(sql, params);
    const [rows] = await pool.execute('SELECT id_aula, nombre, capacidad, ubicacion, estado FROM aulas WHERE id_aula = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creando aula:', err);
    let msg = 'Error al crear aula';
    if (err && err.code === 'ER_DUP_ENTRY') msg = 'El nombre del aula ya existe';
    return res.status(500).json({ error: msg });
  }
};
