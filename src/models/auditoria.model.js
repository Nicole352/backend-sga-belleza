const { pool } = require('../config/database');

/**
 * Obtener lista paginada de auditorías con filtros
 */
async function obtenerAuditorias(filtros = {}) {
  try {
    const {
      pagina = 1,
      limite = 20,
      usuario_id,
      tabla,
      operacion,
      fecha_inicio,
      fecha_fin,
      id_registro,
      busqueda
    } = filtros;

    const offset = (pagina - 1) * limite;
    let whereConditions = [];
    let params = [];

    // Filtros
    if (usuario_id) {
      whereConditions.push('a.usuario_id = ?');
      params.push(usuario_id);
    }

    if (tabla) {
      whereConditions.push('a.tabla_afectada = ?');
      params.push(tabla);
    }

    if (operacion) {
      whereConditions.push('a.operacion = ?');
      params.push(operacion);
    }

    if (fecha_inicio) {
      whereConditions.push('DATE(a.fecha_operacion) >= ?');
      params.push(fecha_inicio);
    }

    if (fecha_fin) {
      whereConditions.push('DATE(a.fecha_operacion) <= ?');
      params.push(fecha_fin);
    }

    if (id_registro) {
      whereConditions.push('a.id_registro = ?');
      params.push(id_registro);
    }

    if (busqueda) {
      whereConditions.push('(u.nombre LIKE ? OR u.apellido LIKE ? OR a.tabla_afectada LIKE ?)');
      const searchTerm = `%${busqueda}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Query principal con JOIN a usuarios
    const query = `
      SELECT 
        a.id_auditoria,
        a.tabla_afectada,
        a.operacion,
        a.id_registro,
        a.usuario_id,
        a.datos_anteriores,
        a.datos_nuevos,
        a.ip_address,
        a.user_agent,
        a.fecha_operacion,
        u.nombre AS usuario_nombre,
        u.apellido AS usuario_apellido,
        u.username AS usuario_username
      FROM auditoria_sistema a
      LEFT JOIN usuarios u ON a.usuario_id = u.id_usuario
      ${whereClause}
      ORDER BY a.fecha_operacion DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limite, offset);

    const [rows] = await pool.query(query, params);

    // Contar total de registros
    const countQuery = `
      SELECT COUNT(*) as total
      FROM auditoria_sistema a
      LEFT JOIN usuarios u ON a.usuario_id = u.id_usuario
      ${whereClause}
    `;

    const countParams = params.slice(0, -2); // Remover LIMIT y OFFSET
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].total;

    return {
      auditorias: rows,
      total,
      pagina: parseInt(pagina),
      limite: parseInt(limite),
      totalPaginas: Math.ceil(total / limite)
    };
  } catch (error) {
    console.error('Error al obtener auditorías:', error);
    throw error;
  }
}

/**
 * Obtener detalle de una auditoría específica
 */
async function obtenerAuditoriaPorId(idAuditoria) {
  try {
    const query = `
      SELECT 
        a.id_auditoria,
        a.tabla_afectada,
        a.operacion,
        a.id_registro,
        a.usuario_id,
        a.datos_anteriores,
        a.datos_nuevos,
        a.ip_address,
        a.user_agent,
        a.fecha_operacion,
        u.nombre AS usuario_nombre,
        u.apellido AS usuario_apellido,
        u.username AS usuario_username,
        u.email AS usuario_email
      FROM auditoria_sistema a
      LEFT JOIN usuarios u ON a.usuario_id = u.id_usuario
      WHERE a.id_auditoria = ?
    `;

    const [rows] = await pool.query(query, [idAuditoria]);
    return rows[0] || null;
  } catch (error) {
    console.error('Error al obtener auditoría por ID:', error);
    throw error;
  }
}

/**
 * Obtener auditorías de un usuario específico
 */
async function obtenerAuditoriasPorUsuario(usuarioId, limite = 50) {
  try {
    const query = `
      SELECT 
        a.id_auditoria,
        a.tabla_afectada,
        a.operacion,
        a.id_registro,
        a.fecha_operacion,
        a.ip_address
      FROM auditoria_sistema a
      WHERE a.usuario_id = ?
      ORDER BY a.fecha_operacion DESC
      LIMIT ?
    `;

    const [rows] = await pool.query(query, [usuarioId, limite]);
    return rows;
  } catch (error) {
    console.error('Error al obtener auditorías por usuario:', error);
    throw error;
  }
}

/**
 * Obtener auditorías de una tabla específica
 */
async function obtenerAuditoriasPorTabla(tabla, limite = 50) {
  try {
    const query = `
      SELECT 
        a.id_auditoria,
        a.operacion,
        a.id_registro,
        a.usuario_id,
        a.fecha_operacion,
        u.nombre AS usuario_nombre,
        u.apellido AS usuario_apellido
      FROM auditoria_sistema a
      LEFT JOIN usuarios u ON a.usuario_id = u.id_usuario
      WHERE a.tabla_afectada = ?
      ORDER BY a.fecha_operacion DESC
      LIMIT ?
    `;

    const [rows] = await pool.query(query, [tabla, limite]);
    return rows;
  } catch (error) {
    console.error('Error al obtener auditorías por tabla:', error);
    throw error;
  }
}

/**
 * Obtener estadísticas de auditoría
 */
async function obtenerEstadisticas() {
  try {
    // Total de registros
    const [totalResult] = await pool.query('SELECT COUNT(*) as total FROM auditoria_sistema');
    const total = totalResult[0].total;

    // Por tabla
    const [porTabla] = await pool.query(`
      SELECT tabla_afectada, COUNT(*) as cantidad
      FROM auditoria_sistema
      GROUP BY tabla_afectada
      ORDER BY cantidad DESC
      LIMIT 10
    `);

    // Por usuario
    const [porUsuario] = await pool.query(`
      SELECT 
        a.usuario_id,
        u.nombre,
        u.apellido,
        COUNT(*) as cantidad
      FROM auditoria_sistema a
      LEFT JOIN usuarios u ON a.usuario_id = u.id_usuario
      GROUP BY a.usuario_id, u.nombre, u.apellido
      ORDER BY cantidad DESC
      LIMIT 10
    `);

    // Por operación
    const [porOperacion] = await pool.query(`
      SELECT operacion, COUNT(*) as cantidad
      FROM auditoria_sistema
      GROUP BY operacion
    `);

    // Actividad reciente (últimas 24 horas)
    const [actividadReciente] = await pool.query(`
      SELECT COUNT(*) as cantidad
      FROM auditoria_sistema
      WHERE fecha_operacion >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);

    return {
      total,
      porTabla,
      porUsuario,
      porOperacion,
      actividadReciente: actividadReciente[0].cantidad
    };
  } catch (error) {
    console.error('Error al obtener estadísticas de auditoría:', error);
    throw error;
  }
}

/**
 * Obtener tablas únicas registradas en auditoría
 */
async function obtenerTablasUnicas() {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT tabla_afectada
      FROM auditoria_sistema
      ORDER BY tabla_afectada
    `);
    return rows.map(row => row.tabla_afectada);
  } catch (error) {
    console.error('Error al obtener tablas únicas:', error);
    throw error;
  }
}

module.exports = {
  obtenerAuditorias,
  obtenerAuditoriaPorId,
  obtenerAuditoriasPorUsuario,
  obtenerAuditoriasPorTabla,
  obtenerEstadisticas,
  obtenerTablasUnicas
};
