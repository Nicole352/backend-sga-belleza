const { pool } = require('../config/database');

async function listCursos({ estado, tipo, page = 1, limit = 10 }) {
  const offset = (page - 1) * limit;
  let sql = `
    SELECT
      c.id_curso,
      c.codigo_curso,
      c.nombre,
      c.descripcion,
      c.fecha_inicio,
      c.fecha_fin,
      c.estado,
      tc.precio_base
    FROM cursos c
    JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
    WHERE 1=1
  `;
  const params = [];

  if (estado) {
    sql += ' AND c.estado = ?';
    params.push(estado);
  }
  if (tipo) {
    sql += ' AND c.id_tipo_curso = ?';
    params.push(tipo);
  }

  sql += ' ORDER BY c.fecha_inicio DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getCursoById(id) {
  const [rows] = await pool.execute(
    `
    SELECT
      c.*,
      tc.nombre AS tipo_curso_nombre,
      tc.precio_base
    FROM cursos c
    JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
    WHERE c.id_curso = ?
    `,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  listCursos,
  getCursoById,
};
