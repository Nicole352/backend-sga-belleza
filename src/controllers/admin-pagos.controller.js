const { pool } = require('../config/database');

// Obtener todos los pagos con información de estudiantes
exports.getAllPagos = async (req, res) => {
  try {
    const { estado, search, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT 
        pm.id_pago,
        pm.numero_cuota,
        pm.monto,
        pm.fecha_vencimiento,
        pm.fecha_pago,
        pm.metodo_pago,
        pm.numero_comprobante,
        pm.banco_comprobante,
        pm.fecha_transferencia,
        pm.estado,
        pm.observaciones,
        pm.verificado_por,
        pm.fecha_verificacion,
        u.nombre as estudiante_nombre,
        u.apellido as estudiante_apellido,
        u.cedula as estudiante_cedula,
        c.id_curso,
        c.nombre as curso_nombre,
        m.codigo_matricula
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      WHERE 1=1
    `;

    const params = [];

    // Filtro por estado
    if (estado && estado !== 'todos') {
      sql += ' AND pm.estado = ?';
      params.push(estado);
    }

    // Búsqueda
    if (search) {
      sql += ` AND (
        u.nombre LIKE ? OR 
        u.apellido LIKE ? OR 
        u.cedula LIKE ? OR 
        c.nombre LIKE ? OR
        m.codigo_matricula LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Agregar limit y offset como números directamente en el SQL (no como parámetros)
    const limitNum = parseInt(limit) || 50;
    const offsetNum = parseInt(offset) || 0;
    
    sql += ` ORDER BY pm.fecha_vencimiento DESC, pm.id_pago DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const [pagos] = await pool.execute(sql, params);

    res.json(pagos);
  } catch (error) {
    console.error('Error obteniendo pagos:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Obtener estadísticas de pagos
exports.getEstadisticas = async (req, res) => {
  try {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_pagos,
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pagos_pendientes,
        SUM(CASE WHEN estado = 'pagado' THEN 1 ELSE 0 END) as pagos_pagados,
        SUM(CASE WHEN estado = 'verificado' THEN 1 ELSE 0 END) as pagos_verificados,
        SUM(CASE WHEN estado = 'vencido' THEN 1 ELSE 0 END) as pagos_vencidos,
        SUM(CASE WHEN estado IN ('pendiente', 'vencido') THEN monto ELSE 0 END) as monto_total_pendiente,
        SUM(CASE WHEN estado = 'verificado' THEN monto ELSE 0 END) as monto_total_verificado
      FROM pagos_mensuales
    `);

    res.json(stats[0]);
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Obtener detalle de un pago específico
exports.getPagoDetalle = async (req, res) => {
  try {
    const { id } = req.params;

    const [pagos] = await pool.execute(`
      SELECT 
        pm.*,
        u.nombre as estudiante_nombre,
        u.apellido as estudiante_apellido,
        u.cedula as estudiante_cedula,
        u.email as estudiante_email,
        u.telefono as estudiante_telefono,
        c.nombre as curso_nombre,
        c.codigo_curso,
        tc.nombre as tipo_curso_nombre,
        m.codigo_matricula,
        m.monto_matricula,
        verificador.nombre as verificado_por_nombre,
        verificador.apellido as verificado_por_apellido
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      LEFT JOIN usuarios verificador ON pm.verificado_por = verificador.id_usuario
      WHERE pm.id_pago = ?
    `, [id]);

    if (pagos.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    res.json(pagos[0]);
  } catch (error) {
    console.error('Error obteniendo detalle del pago:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Verificar un pago
exports.verificarPago = async (req, res) => {
  try {
    const { id } = req.params;
    const { verificado_por } = req.body; // ID del admin que verifica

    // Verificar que el pago existe y está en estado 'pagado'
    const [pago] = await pool.execute(
      'SELECT id_pago, estado FROM pagos_mensuales WHERE id_pago = ?',
      [id]
    );

    if (pago.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    if (pago[0].estado !== 'pagado') {
      return res.status(400).json({ 
        error: `No se puede verificar un pago en estado '${pago[0].estado}'. Solo se pueden verificar pagos en estado 'pagado'.` 
      });
    }

    // Actualizar el pago a verificado
    await pool.execute(`
      UPDATE pagos_mensuales 
      SET 
        estado = 'verificado',
        verificado_por = ?,
        fecha_verificacion = NOW()
      WHERE id_pago = ?
    `, [verificado_por, id]);

    console.log(`✅ Pago ${id} verificado por usuario ${verificado_por}`);

    res.json({ 
      success: true, 
      message: 'Pago verificado exitosamente' 
    });
  } catch (error) {
    console.error('Error verificando pago:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Descargar comprobante de pago
exports.descargarComprobante = async (req, res) => {
  try {
    const { id } = req.params;

    const [pagos] = await pool.execute(`
      SELECT 
        comprobante_pago_blob,
        comprobante_mime,
        comprobante_nombre_original
      FROM pagos_mensuales
      WHERE id_pago = ?
    `, [id]);

    if (pagos.length === 0 || !pagos[0].comprobante_pago_blob) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    const pago = pagos[0];
    
    res.setHeader('Content-Type', pago.comprobante_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${pago.comprobante_nombre_original || `comprobante-${id}`}"`);
    res.send(pago.comprobante_pago_blob);
  } catch (error) {
    console.error('Error descargando comprobante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Rechazar un pago (volver a pendiente con observaciones)
exports.rechazarPago = async (req, res) => {
  try {
    const { id } = req.params;
    const { observaciones, verificado_por } = req.body;

    if (!observaciones) {
      return res.status(400).json({ error: 'Las observaciones son requeridas para rechazar un pago' });
    }

    // Verificar que el pago existe
    const [pago] = await pool.execute(
      'SELECT id_pago, estado FROM pagos_mensuales WHERE id_pago = ?',
      [id]
    );

    if (pago.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    // Actualizar el pago a pendiente con observaciones
    await pool.execute(`
      UPDATE pagos_mensuales 
      SET 
        estado = 'pendiente',
        observaciones = ?,
        verificado_por = ?,
        fecha_verificacion = NOW()
      WHERE id_pago = ?
    `, [observaciones, verificado_por, id]);

    console.log(`❌ Pago ${id} rechazado por usuario ${verificado_por}`);

    res.json({ 
      success: true, 
      message: 'Pago rechazado. El estudiante deberá volver a subir el comprobante.' 
    });
  } catch (error) {
    console.error('Error rechazando pago:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};
