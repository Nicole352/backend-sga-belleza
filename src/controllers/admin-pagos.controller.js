const { pool } = require('../config/database');
const { enviarComprobantePagoMensual } = require('../services/emailService');
const { generarComprobantePagoMensual } = require('../services/pdfService');

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
        pm.recibido_por,
        pm.estado,
        pm.observaciones,
        pm.verificado_por,
        pm.fecha_verificacion,
        u.nombre as estudiante_nombre,
        u.apellido as estudiante_apellido,
        u.cedula as estudiante_cedula,
        c.id_curso,
        c.nombre as curso_nombre,
        m.codigo_matricula,
        tc.modalidad_pago,
        tc.numero_clases,
        tc.precio_por_clase
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
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

    console.log('📊 Pagos obtenidos:', pagos.length);
    if (pagos.length > 0) {
      console.log('🔍 Primer pago:', {
        estudiante: pagos[0].estudiante_nombre,
        recibido_por: pagos[0].recibido_por,
        metodo_pago: pagos[0].metodo_pago
      });
    }

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

    // Verificar que el usuario que verifica es admin (no superadmin)
    const [usuario] = await pool.execute(`
      SELECT u.id_usuario, r.nombre_rol
      FROM usuarios u
      INNER JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = ?
    `, [verificado_por]);

    console.log('🔍 Verificando usuario:', verificado_por);
    console.log('👤 Usuario encontrado:', usuario);

    if (usuario.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const rolPermitido = usuario[0].nombre_rol.toLowerCase();
    console.log('🎭 Rol del usuario:', rolPermitido);
    
    if (rolPermitido !== 'admin' && rolPermitido !== 'administrativo') {
      console.log('❌ Rol no permitido:', rolPermitido);
      return res.status(403).json({ 
        error: `Solo los administradores pueden verificar pagos. Rol actual: ${rolPermitido}` 
      });
    }
    
    console.log('✅ Rol permitido, continuando con verificación...');

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

    // ENVIAR EMAIL CON PDF DEL COMPROBANTE AL ESTUDIANTE (asíncrono)
    // ⚠️ IMPORTANTE: NO enviar email para cuota #1 (ya se envió con email de bienvenida)
    setImmediate(async () => {
      try {
        // Obtener datos completos del pago para el PDF y email
        const [pagoCompleto] = await pool.execute(`
          SELECT 
            pm.id_pago,
            pm.numero_cuota,
            pm.monto,
            pm.fecha_pago,
            pm.metodo_pago,
            pm.fecha_vencimiento,
            u.nombre as estudiante_nombres,
            u.apellido as estudiante_apellidos,
            u.cedula as estudiante_cedula,
            u.email as estudiante_email,
            c.nombre as curso_nombre,
            tc.modalidad_pago,
            m.id_matricula
          FROM pagos_mensuales pm
          INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
          INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
          INNER JOIN cursos c ON m.id_curso = c.id_curso
          INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
          WHERE pm.id_pago = ?
        `, [id]);

        console.log('🔍 Datos del pago obtenidos:', pagoCompleto);

        if (pagoCompleto.length > 0) {
          const pago = pagoCompleto[0];
          
          // ⚠️ NO ENVIAR EMAIL PARA CUOTA #1 (ya se envió con el email de bienvenida)
          if (pago.numero_cuota === 1) {
            console.log('⏭️ Cuota #1 detectada - Email ya enviado con bienvenida, omitiendo envío duplicado');
            return;
          }
          
          console.log('📧 Enviando email a:', pago.estudiante_email);
          
          const datosEstudiante = {
            nombres: pago.estudiante_nombres,
            apellidos: pago.estudiante_apellidos,
            cedula: pago.estudiante_cedula,
            email: pago.estudiante_email
          };

          const datosPago = {
            id_pago_mensual: pago.id_pago,
            numero_cuota: pago.numero_cuota,
            monto: pago.monto,
            fecha_pago: pago.fecha_pago,
            metodo_pago: pago.metodo_pago,
            mes_pago: pago.fecha_vencimiento, // Usar fecha_vencimiento como mes_pago
            modalidad_pago: pago.modalidad_pago
          };

          const datosCurso = {
            nombre_curso: pago.curso_nombre
          };

          // Si es modalidad por clases, obtener progreso de clases pagadas
          let clasesPagadas = null;
          if (pago.modalidad_pago === 'clases') {
            const [clasesResult] = await pool.execute(`
              SELECT numero_cuota, monto, fecha_pago
              FROM pagos_mensuales 
              WHERE id_matricula = ? AND estado IN ('pagado', 'verificado')
              ORDER BY numero_cuota ASC
            `, [pago.id_matricula]);
            
            clasesPagadas = clasesResult.map(clase => ({
              numero: clase.numero_cuota,
              monto: parseFloat(clase.monto),
              fecha: clase.fecha_pago
            }));
            
            console.log('🔍 Clases pagadas encontradas:', clasesPagadas);
          }

          console.log('📄 Generando PDF del comprobante...');
          // Generar PDF del comprobante
          const pdfBuffer = await generarComprobantePagoMensual(datosEstudiante, datosPago, datosCurso, clasesPagadas);

          console.log('📧 Enviando email con PDF adjunto...');
          // Enviar email con PDF adjunto
          await enviarComprobantePagoMensual(datosEstudiante, datosPago, pdfBuffer);
          
          console.log('✅ Email con comprobante PDF enviado a:', pago.estudiante_email);
        } else {
          console.log('❌ No se encontró el pago con ID:', id);
        }
      } catch (emailError) {
        console.error('❌ Error enviando email con comprobante (no afecta la verificación):', emailError);
      }
    });

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

    // Verificar que el usuario que rechaza es admin (no superadmin)
    const [usuario] = await pool.execute(`
      SELECT u.id_usuario, r.nombre_rol
      FROM usuarios u
      INNER JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.id_usuario = ?
    `, [verificado_por]);

    if (usuario.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const rolPermitido = usuario[0].nombre_rol.toLowerCase();
    if (rolPermitido !== 'admin' && rolPermitido !== 'administrativo') {
      return res.status(403).json({ 
        error: 'Solo los administradores pueden rechazar pagos. Los superadministradores no tienen permiso para esta acción.' 
      });
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
