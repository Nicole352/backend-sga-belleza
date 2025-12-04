const { pool } = require('../config/database');

class PromocionesModel {
  // Crear nueva promoción
  static async create(promocionData) {
    const {
      id_curso_principal,
      id_curso_promocional,
      nombre_promocion,
      descripcion,
      meses_gratis,
      clases_gratis,
      fecha_inicio,
      fecha_fin,
      cupos_disponibles,
      created_by
    } = promocionData;

    const [result] = await pool.execute(`
      INSERT INTO promociones (
        id_curso_principal, id_curso_promocional, nombre_promocion, descripcion, 
        meses_gratis, fecha_inicio, fecha_fin, 
        cupos_disponibles, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id_curso_principal,
      id_curso_promocional,
      nombre_promocion,
      descripcion,
      meses_gratis || clases_gratis || 1,
      fecha_inicio || null,
      fecha_fin || null,
      cupos_disponibles,
      created_by
    ]);

    return result.insertId;
  }

  // Obtener todas las promociones (con info del curso)
  static async getAll() {
    const [promociones] = await pool.execute(`
      SELECT 
        p.*,
        cp.nombre as nombre_curso_principal,
        cp.codigo_curso as codigo_curso_principal,
        cp.horario as horario_principal,
        cp.capacidad_maxima as capacidad_curso_principal,
        cp.cupos_disponibles as cupos_curso_principal,
        tcp.modalidad_pago as modalidad_principal,
        cpr.nombre as nombre_curso_promocional,
        cpr.codigo_curso as codigo_curso_promocional,
        cpr.horario as horario_promocional,
        cpr.capacidad_maxima as capacidad_curso_promocional,
        cpr.cupos_disponibles as cupos_curso_promocional,
        tcpr.modalidad_pago as modalidad_promocional,
        tcpr.precio_base,
        tcpr.precio_por_clase,
        u.nombre as creado_por_nombre,
        u.apellido as creado_por_apellido
      FROM promociones p
      INNER JOIN cursos cp ON p.id_curso_principal = cp.id_curso
      INNER JOIN tipos_cursos tcp ON cp.id_tipo_curso = tcp.id_tipo_curso
      INNER JOIN cursos cpr ON p.id_curso_promocional = cpr.id_curso
      INNER JOIN tipos_cursos tcpr ON cpr.id_tipo_curso = tcpr.id_tipo_curso
      LEFT JOIN usuarios u ON p.created_by = u.id_usuario
      ORDER BY p.created_at DESC
    `);

    return promociones;
  }

  // Obtener promociones activas
  static async getActivas() {
    const [promociones] = await pool.execute(`
      SELECT 
        p.*,
        cp.nombre as nombre_curso_principal,
        cp.horario as horario_principal,
        cpr.nombre as nombre_curso_promocional,
        cpr.horario as horario_promocional,
        tcpr.duracion_meses,
        tcpr.precio_base,
        tcpr.precio_por_clase,
        tcpr.modalidad_pago
      FROM promociones p
      INNER JOIN cursos cp ON p.id_curso_principal = cp.id_curso
      INNER JOIN cursos cpr ON p.id_curso_promocional = cpr.id_curso
      INNER JOIN tipos_cursos tcpr ON cpr.id_tipo_curso = tcpr.id_tipo_curso
      WHERE p.activa = TRUE
        AND (p.cupos_disponibles IS NULL OR p.cupos_utilizados < p.cupos_disponibles)
      ORDER BY p.created_at DESC
    `);

    return promociones;
  }

  // Obtener promociones activas por curso PRINCIPAL
  static async getActivasByCurso(id_curso_principal) {
    const [promociones] = await pool.execute(`
      SELECT 
        p.*,
        cp.nombre as nombre_curso_principal,
        cpr.nombre as nombre_curso_promocional,
        tcpr.duracion_meses,
        tcpr.precio_base,
        tcpr.precio_por_clase,
        tcpr.modalidad_pago
      FROM promociones p
      INNER JOIN cursos cp ON p.id_curso_principal = cp.id_curso
      INNER JOIN cursos cpr ON p.id_curso_promocional = cpr.id_curso
      INNER JOIN tipos_cursos tcpr ON cpr.id_tipo_curso = tcpr.id_tipo_curso
      WHERE p.id_curso_principal = ?
        AND p.activa = TRUE
        AND (p.cupos_disponibles IS NULL OR p.cupos_utilizados < p.cupos_disponibles)
    `, [id_curso_principal]);

    return promociones;
  }

  // Obtener promoción por ID
  static async getById(id_promocion) {
    const [promociones] = await pool.execute(`
      SELECT 
        p.*,
        cp.nombre as nombre_curso_principal,
        cpr.nombre as nombre_curso_promocional,
        tcpr.duracion_meses,
        tcpr.precio_base,
        tcpr.modalidad_pago
      FROM promociones p
      INNER JOIN cursos cp ON p.id_curso_principal = cp.id_curso
      INNER JOIN cursos cpr ON p.id_curso_promocional = cpr.id_curso
      INNER JOIN tipos_cursos tcpr ON cpr.id_tipo_curso = tcpr.id_tipo_curso
      WHERE p.id_promocion = ?
    `, [id_promocion]);

    if (promociones.length === 0) return null;
    return promociones[0];
  }

  // Actualizar promoción
  static async update(id_promocion, promocionData) {
    const {
      id_curso_principal,
      id_curso_promocional,
      nombre_promocion,
      descripcion,
      meses_gratis,
      clases_gratis,
      fecha_inicio,
      fecha_fin,
      cupos_disponibles,
      activa
    } = promocionData;

    await pool.execute(`
      UPDATE promociones SET
        id_curso_principal = ?,
        id_curso_promocional = ?,
        nombre_promocion = ?,
        descripcion = ?,
        meses_gratis = ?,
        fecha_inicio = ?,
        fecha_fin = ?,
        cupos_disponibles = ?,
        activa = ?
      WHERE id_promocion = ?
    `, [
      id_curso_principal,
      id_curso_promocional,
      nombre_promocion,
      descripcion,
      meses_gratis || clases_gratis || 1,
      fecha_inicio || null,
      fecha_fin || null,
      cupos_disponibles,
      activa !== undefined ? activa : true,
      id_promocion
    ]);

    return true;
  }

  // Activar/Desactivar promoción
  static async toggleActiva(id_promocion, activa) {
    await pool.execute(`
      UPDATE promociones SET activa = ? WHERE id_promocion = ?
    `, [activa, id_promocion]);

    return true;
  }

  // Eliminar promoción
  static async delete(id_promocion) {
    await pool.execute(`
      DELETE FROM promociones WHERE id_promocion = ?
    `, [id_promocion]);

    return true;
  }

  // Registrar que un estudiante aceptó la promoción
  static async aceptarPromocion(estudiantePromoData) {
    const {
      id_estudiante,
      id_promocion,
      horario_seleccionado,
      meses_gratis_aplicados,
      fecha_inicio_cobro
    } = estudiantePromoData;

    const [result] = await pool.execute(`
      INSERT INTO estudiante_promocion (
        id_estudiante, id_promocion, horario_seleccionado,
        meses_gratis_aplicados, fecha_inicio_cobro
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      id_estudiante,
      id_promocion,
      horario_seleccionado,
      meses_gratis_aplicados,
      fecha_inicio_cobro
    ]);

    // Incrementar cupos utilizados
    await pool.execute(`
      UPDATE promociones 
      SET cupos_utilizados = cupos_utilizados + 1
      WHERE id_promocion = ?
    `, [id_promocion]);

    return result.insertId;
  }

  // Asociar promoción con matrícula
  static async asociarMatricula(id_estudiante_promocion, id_matricula) {
    await pool.execute(`
      UPDATE estudiante_promocion
      SET id_matricula = ?
      WHERE id_estudiante_promocion = ?
    `, [id_matricula, id_estudiante_promocion]);

    return true;
  }

  // Verificar si estudiante ya tiene promoción para un curso
  static async estudianteTienePromocion(id_estudiante, id_curso) {
    const [result] = await pool.execute(`
      SELECT ep.* 
      FROM estudiante_promocion ep
      INNER JOIN promociones p ON ep.id_promocion = p.id_promocion
      WHERE ep.id_estudiante = ? AND p.id_curso = ?
    `, [id_estudiante, id_curso]);

    return result.length > 0 ? result[0] : null;
  }

  // Obtener promoción aceptada por estudiante
  static async getPromocionEstudiante(id_estudiante, id_matricula) {
    const [result] = await pool.execute(`
      SELECT 
        ep.*,
        p.nombre_promocion,
        p.meses_gratis,
        p.horarios_disponibles,
        c.nombre_curso
      FROM estudiante_promocion ep
      INNER JOIN promociones p ON ep.id_promocion = p.id_promocion
      INNER JOIN cursos c ON p.id_curso = c.id_curso
      WHERE ep.id_estudiante = ? AND ep.id_matricula = ?
    `, [id_estudiante, id_matricula]);

    if (result.length === 0) return null;

    return {
      ...result[0],
      horarios_disponibles: JSON.parse(result[0].horarios_disponibles || '[]')
    };
  }

  // Obtener estadísticas de promoción
  static async getEstadisticas(id_promocion) {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_aceptaciones,
        COUNT(CASE WHEN id_matricula IS NOT NULL THEN 1 END) as matriculados,
        p.cupos_disponibles,
        p.cupos_utilizados
      FROM estudiante_promocion ep
      INNER JOIN promociones p ON ep.id_promocion = p.id_promocion
      WHERE ep.id_promocion = ?
      GROUP BY p.cupos_disponibles, p.cupos_utilizados
    `, [id_promocion]);

    return stats[0] || {
      total_aceptaciones: 0,
      matriculados: 0,
      cupos_disponibles: null,
      cupos_utilizados: 0
    };
  }
}

module.exports = PromocionesModel;
