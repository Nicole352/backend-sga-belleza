const { pool } = require('../config/database');

async function listCursos({ estado, tipo, page = 1, limit = 10 }) {
  // Sanitize pagination values as integers to safely inline into SQL
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10));
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const offset = (safePage - 1) * safeLimit;
  let sql = `
    SELECT
      c.id_curso,
      c.codigo_curso,
      c.id_tipo_curso,
      c.nombre,
      c.horario,
      c.fecha_inicio,
      c.fecha_fin,
      c.estado,
      c.capacidad_maxima,
      tc.precio_base,
      GREATEST(0, c.capacidad_maxima - (
        COALESCE(
          (SELECT COUNT(*) 
           FROM matriculas m 
           WHERE m.id_curso = c.id_curso 
           AND m.estado = 'activa'), 0
        ) + COALESCE(
          (SELECT COUNT(*) 
           FROM solicitudes_matricula s 
           WHERE s.id_curso = c.id_curso 
           AND s.estado = 'pendiente'), 0
        )
      )) AS cupos_disponibles
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

  // Important: inline LIMIT/OFFSET instead of using placeholders to avoid ER_WRONG_ARGUMENTS
  sql += ` ORDER BY c.fecha_inicio DESC LIMIT ${safeLimit} OFFSET ${offset}`;

  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getCursoById(id) {
  const [rows] = await pool.execute(
    `
    SELECT
      c.*,
      tc.nombre AS tipo_curso_nombre,
      tc.precio_base,
      tc.descripcion AS tipo_descripcion,
      COALESCE(
        (SELECT COUNT(*) 
         FROM matriculas m 
         WHERE m.id_curso = c.id_curso 
         AND m.estado = 'activa'), 0
      ) AS total_estudiantes,
      GREATEST(0, c.capacidad_maxima - (
        COALESCE(
          (SELECT COUNT(*) 
           FROM matriculas m 
           WHERE m.id_curso = c.id_curso 
           AND m.estado = 'activa'), 0
        ) + COALESCE(
          (SELECT COUNT(*) 
           FROM solicitudes_matricula s 
           WHERE s.id_curso = c.id_curso 
           AND s.estado = 'pendiente'), 0
        )
      )) AS cupos_disponibles
    FROM cursos c
    JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
    WHERE c.id_curso = ?
    `,
    [id]
  );
  return rows[0] || null;
}

async function createCurso(data) {
  const {
    id_tipo_curso,
    nombre,
    horario = 'matutino',
    capacidad_maxima = 20,
    fecha_inicio,
    fecha_fin,
    estado = 'planificado'
  } = data;

  // Validaciones
  if (!id_tipo_curso || !nombre || !fecha_inicio || !fecha_fin) {
    throw new Error('Faltan campos obligatorios: id_tipo_curso, nombre, fecha_inicio, fecha_fin');
  }

  // Usar el código que viene del frontend (ya generado automáticamente)
  const codigo_curso = data.codigo_curso || `CUR${String(Date.now()).slice(-4)}`;

  const [result] = await pool.execute(
    `INSERT INTO cursos (
      codigo_curso, id_tipo_curso, nombre, horario,
      capacidad_maxima, cupos_disponibles, fecha_inicio, fecha_fin, estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [codigo_curso, id_tipo_curso, nombre, horario, capacidad_maxima, capacidad_maxima, fecha_inicio, fecha_fin, estado]
  );

  return getCursoById(result.insertId);
}

async function updateCurso(id, data) {
  const {
    codigo_curso,
    id_tipo_curso,
    nombre,
    horario,
    capacidad_maxima,
    fecha_inicio,
    fecha_fin,
    estado
  } = data;

  const fields = [];
  const values = [];

  if (codigo_curso !== undefined) {
    fields.push('codigo_curso = ?');
    values.push(codigo_curso);
  }
  if (id_tipo_curso !== undefined) {
    fields.push('id_tipo_curso = ?');
    values.push(id_tipo_curso);
  }
  if (nombre !== undefined) {
    fields.push('nombre = ?');
    values.push(nombre);
  }
  if (horario !== undefined) {
    fields.push('horario = ?');
    values.push(horario);
  }
  if (capacidad_maxima !== undefined) {
    fields.push('capacidad_maxima = ?');
    values.push(capacidad_maxima);
  }
  if (fecha_inicio !== undefined) {
    fields.push('fecha_inicio = ?');
    values.push(fecha_inicio);
  }
  if (fecha_fin !== undefined) {
    fields.push('fecha_fin = ?');
    values.push(fecha_fin);
  }
  if (estado !== undefined) {
    fields.push('estado = ?');
    values.push(estado);
  }

  if (fields.length === 0) {
    return 0; // No hay campos para actualizar
  }

  values.push(id);
  const [result] = await pool.execute(
    `UPDATE cursos SET ${fields.join(', ')} WHERE id_curso = ?`,
    values
  );

  return result.affectedRows;
}

async function deleteCurso(id) {
  const [result] = await pool.execute('DELETE FROM cursos WHERE id_curso = ?', [id]);
  return result.affectedRows;
}

module.exports = {
  listCursos,
  getCursoById,
  createCurso,
  updateCurso,
  deleteCurso,
};
