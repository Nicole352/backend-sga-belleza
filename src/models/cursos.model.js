const { pool } = require('../config/database');

// Obtener todos los cursos con información relacionada
async function getAllCursos({ estado, tipo, page = 1, limit = 10 }) {
  const offset = (page - 1) * limit;
  let sql = `
    SELECT 
      c.id_curso,
      c.codigo_curso,
      c.nombre,
      c.descripcion,
      c.capacidad_maxima,
      c.fecha_inicio,
      c.fecha_fin,
      c.horario,
      c.estado,
      c.fecha_creacion,
      tc.nombre AS tipo_curso_nombre,
      tc.precio_base,
      a.nombre AS aula_nombre,
      a.ubicacion AS aula_ubicacion,
      COUNT(DISTINCT m.id_matricula) AS estudiantes_inscritos,
      COUNT(DISTINCT dc.id_docente) AS docentes_asignados,
      GROUP_CONCAT(DISTINCT CONCAT(u.nombre, ' ', u.apellido) SEPARATOR ', ') AS profesores
    FROM cursos c
    LEFT JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
    LEFT JOIN aulas a ON c.id_aula = a.id_aula
    LEFT JOIN matriculas m ON c.id_curso = m.id_curso AND m.estado = 'activa'
    LEFT JOIN docente_curso dc ON c.id_curso = dc.id_curso AND dc.estado = 'activo'
    LEFT JOIN docentes d ON dc.id_docente = d.id_docente
    LEFT JOIN usuarios u ON d.id_usuario = u.id_usuario
    WHERE 1=1
  `;
  
  const params = [];

  if (estado && estado !== 'todos') {
    sql += ' AND c.estado = ?';
    params.push(estado);
  }
  
  if (tipo) {
    sql += ' AND c.id_tipo_curso = ?';
    params.push(tipo);
  }

  sql += `
    GROUP BY c.id_curso
    ORDER BY c.fecha_creacion DESC 
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Obtener un curso por ID
async function getCursoById(id) {
  const [rows] = await pool.execute(`
    SELECT 
      c.*,
      tc.nombre AS tipo_curso_nombre,
      tc.precio_base,
      a.nombre AS aula_nombre,
      a.ubicacion AS aula_ubicacion,
      a.capacidad AS aula_capacidad
    FROM cursos c
    LEFT JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
    LEFT JOIN aulas a ON c.id_aula = a.id_aula
    WHERE c.id_curso = ?
  `, [id]);
  
  return rows[0] || null;
}

// Crear nuevo curso
async function createCurso({
  codigo_curso,
  id_tipo_curso,
  id_aula,
  nombre,
  descripcion,
  capacidad_maxima,
  fecha_inicio,
  fecha_fin,
  horario,
  estado = 'planificado'
}) {
  const [result] = await pool.execute(`
    INSERT INTO cursos (
      codigo_curso, id_tipo_curso, id_aula, nombre, descripcion,
      capacidad_maxima, fecha_inicio, fecha_fin, horario, estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    codigo_curso, id_tipo_curso, id_aula, nombre, descripcion,
    capacidad_maxima, fecha_inicio, fecha_fin, horario, estado
  ]);

  return getCursoById(result.insertId);
}

// Actualizar curso
async function updateCurso(id, cursoData) {
  const fields = [];
  const values = [];
  
  // Construir dinámicamente la query de actualización
  const allowedFields = [
    'codigo_curso', 'id_tipo_curso', 'id_aula', 'nombre', 'descripcion',
    'capacidad_maxima', 'fecha_inicio', 'fecha_fin', 'horario', 'estado'
  ];
  
  allowedFields.forEach(field => {
    if (cursoData[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(cursoData[field]);
    }
  });
  
  if (fields.length === 0) {
    throw new Error('No hay campos para actualizar');
  }
  
  values.push(id);
  
  const [result] = await pool.execute(`
    UPDATE cursos SET ${fields.join(', ')} WHERE id_curso = ?
  `, values);
  
  if (result.affectedRows === 0) {
    throw new Error('Curso no encontrado');
  }
  
  return getCursoById(id);
}

// Eliminar curso
async function deleteCurso(id) {
  const [result] = await pool.execute(
    'DELETE FROM cursos WHERE id_curso = ?',
    [id]
  );
  
  return result.affectedRows > 0;
}

// Obtener tipos de cursos
async function getTiposCursos() {
  const [rows] = await pool.execute(`
    SELECT id_tipo_curso, nombre, precio_base, descripcion
    FROM tipos_cursos 
    WHERE estado = 'activo'
    ORDER BY nombre
  `);
  return rows;
}

// Obtener aulas disponibles
async function getAulasDisponibles() {
  const [rows] = await pool.execute(`
    SELECT id_aula, nombre, ubicacion, capacidad
    FROM aulas 
    WHERE estado = 'activa'
    ORDER BY nombre
  `);
  return rows;
}

// Asignar docente a curso
async function asignarDocente(id_curso, id_docente) {
  const [result] = await pool.execute(`
    INSERT INTO docente_curso (id_docente, id_curso, estado)
    VALUES (?, ?, 'activo')
    ON DUPLICATE KEY UPDATE estado = 'activo'
  `, [id_docente, id_curso]);
  
  return result.affectedRows > 0;
}

// Desasignar docente de curso
async function desasignarDocente(id_curso, id_docente) {
  const [result] = await pool.execute(`
    UPDATE docente_curso 
    SET estado = 'inactivo' 
    WHERE id_curso = ? AND id_docente = ?
  `, [id_curso, id_docente]);
  
  return result.affectedRows > 0;
}

// Obtener docentes de un curso
async function getDocentesPorCurso(id_curso) {
  const [rows] = await pool.execute(`
    SELECT 
      d.id_docente,
      u.nombre,
      u.apellido,
      u.email,
      dc.fecha_asignacion,
      dc.estado
    FROM docente_curso dc
    JOIN docentes d ON dc.id_docente = d.id_docente
    JOIN usuarios u ON d.id_usuario = u.id_usuario
    WHERE dc.id_curso = ? AND dc.estado = 'activo'
    ORDER BY dc.fecha_asignacion DESC
  `, [id_curso]);
  
  return rows;
}

// Obtener estadísticas de cursos
async function getEstadisticasCursos() {
  const [rows] = await pool.execute(`
    SELECT 
      COUNT(*) as total_cursos,
      SUM(CASE WHEN estado = 'activo' THEN 1 ELSE 0 END) as cursos_activos,
      SUM(CASE WHEN estado = 'planificado' THEN 1 ELSE 0 END) as cursos_planificados,
      SUM(CASE WHEN estado = 'finalizado' THEN 1 ELSE 0 END) as cursos_finalizados,
      AVG(capacidad_maxima) as promedio_capacidad
    FROM cursos
  `);
  
  return rows[0];
}

module.exports = {
  getAllCursos,
  getCursoById,
  createCurso,
  updateCurso,
  deleteCurso,
  getTiposCursos,
  getAulasDisponibles,
  asignarDocente,
  desasignarDocente,
  getDocentesPorCurso,
  getEstadisticasCursos
};