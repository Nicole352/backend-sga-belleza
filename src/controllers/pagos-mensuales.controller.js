const PagosMenualesModel = require('../models/pagos-mensuales.model');
const { enviarNotificacionPagoEstudiante } = require('../services/emailService');
const { emitSocketEvent } = require('../services/socket.service');
const { notificarNuevoPagoPendiente } = require('../utils/notificationHelper');
const { pool } = require('../config/database');
const ExcelJS = require('exceljs');
const cloudinaryService = require('../services/cloudinary.service');

// Obtener cuotas de una matrícula específica
exports.getCuotasByMatricula = async (req, res) => {
  try {
    const id_matricula = Number(req.params.id_matricula);
    const id_estudiante = req.user?.id_usuario;

    console.log('getCuotasByMatricula - Parámetros recibidos:', {
      id_matricula,
      id_estudiante,
      user: req.user
    });

    if (!id_matricula || !id_estudiante) {
      console.log('Parámetros inválidos:', { id_matricula, id_estudiante });
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    const cuotas = await PagosMenualesModel.getCuotasByMatricula(id_matricula, id_estudiante);
    console.log('Cuotas obtenidas exitosamente:', cuotas.length);
    res.json(cuotas);

  } catch (error) {
    console.error('Error obteniendo cuotas:', {
      message: error.message,
      id_matricula: req.params.id_matricula,
      id_estudiante: req.user?.id_usuario
    });
    res.status(500).json({
      error: error.message || 'Error interno del servidor'
    });
  }
};

// Obtener información de un pago específico
exports.getPagoById = async (req, res) => {
  try {
    const id_pago = Number(req.params.id_pago);
    const id_estudiante = req.user?.id_usuario;

    if (!id_pago || !id_estudiante) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    const pago = await PagosMenualesModel.getPagoById(id_pago, id_estudiante);

    if (!pago) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    res.json(pago);

  } catch (error) {
    console.error('Error obteniendo pago:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

// Procesar pago de mensualidad
exports.pagarCuota = async (req, res) => {
  try {
    const { id_pago } = req.params;
    const {
      metodo_pago,
      monto_pagado,
      numero_comprobante,
      banco_comprobante,
      fecha_transferencia,
      recibido_por,
      observaciones
    } = req.body;

    const id_estudiante = req.user?.id_usuario;

    console.log(' Procesando pago:', {
      id_pago,
      id_estudiante,
      metodo_pago,
      monto_pagado,
      numero_comprobante,
      archivo: req.file ? 'SÍ' : 'NO'
    });

    if (!id_estudiante) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Validar que la cuota pertenece al estudiante
    const cuotaValida = await PagosMenualesModel.validarCuotaEstudiante(id_pago, id_estudiante);

    if (!cuotaValida) {
      return res.status(403).json({ error: 'Cuota no encontrada o no pertenece al estudiante' });
    }

    // Validar que el método de pago sea válido
    const metodosValidos = ['transferencia', 'efectivo'];
    if (!metodosValidos.includes(metodo_pago)) {
      return res.status(400).json({
        success: false,
        message: 'Método de pago no válido. Debe ser: transferencia o efectivo'
      });
    }

    // Validaciones específicas por método de pago
    if (metodo_pago === 'transferencia') {
      if (!numero_comprobante || !banco_comprobante || !fecha_transferencia) {
        return res.status(400).json({
          success: false,
          message: 'Para transferencias se requiere: número de comprobante, banco y fecha'
        });
      }
    }

    if (metodo_pago === 'efectivo') {
      if (!numero_comprobante) {
        return res.status(400).json({
          success: false,
          message: 'Para pagos en efectivo se requiere el número de factura/comprobante'
        });
      }
    }

    // Validar número de comprobante único si es transferencia
    if (metodo_pago === 'transferencia' && numero_comprobante) {
      const exists = await PagosMenualesModel.existeNumeroComprobante(numero_comprobante, id_pago);
      if (exists) {
        return res.status(400).json({
          error: 'Este número de comprobante ya fue utilizado en otro pago'
        });
      }
    }

    // Subir archivo a Cloudinary si existe
    let archivoData = null;
    let comprobanteCloudinary = null;

    if (req.file) {
      try {
        console.log(' Subiendo comprobante a Cloudinary...');
        comprobanteCloudinary = await cloudinaryService.uploadFile(
          req.file.buffer,
          'comprobantes',
          `pago-cuota-${id_pago}-${Date.now()}`
        );
        console.log(' Comprobante subido a Cloudinary:', comprobanteCloudinary.secure_url);
      } catch (cloudinaryError) {
        console.error(' Error subiendo a Cloudinary:', cloudinaryError);
        // Continuar sin Cloudinary (fallback a LONGBLOB)
      }

      archivoData = {
        comprobanteBuffer: req.file.buffer,
        comprobanteMime: req.file.mimetype,
        comprobanteSizeKb: Math.round(req.file.size / 1024),
        comprobanteNombreOriginal: req.file.originalname,
        comprobanteUrl: comprobanteCloudinary?.secure_url || null,
        comprobantePublicId: comprobanteCloudinary?.public_id || null
      };
      console.log(' Archivo procesado:', archivoData.comprobanteNombreOriginal);
    }

    const pagoData = {
      metodo_pago,
      monto_pagado,
      numero_comprobante,
      banco_comprobante,
      fecha_transferencia,
      recibido_por: metodo_pago === 'efectivo' ? recibido_por : null,
      observaciones
    };

    const resultado = await PagosMenualesModel.procesarPago(id_pago, pagoData, archivoData, id_estudiante);

    console.log(' Pago procesado exitosamente:', resultado);

    // ENVIAR EMAIL AL ADMIN NOTIFICANDO EL NUEVO PAGO (asíncrono)
    setImmediate(async () => {
      try {
        // Obtener datos completos del pago para el email
        const [pagoCompleto] = await pool.execute(`
          SELECT
            pm.id_pago,
            pm.numero_cuota,
            pm.monto,
            pm.fecha_pago,
            pm.metodo_pago,
            u.nombre as estudiante_nombre,
            u.apellido as estudiante_apellido,
            u.cedula as estudiante_cedula,
            u.email as estudiante_email,
            c.nombre as curso_nombre
          FROM pagos_mensuales pm
          INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
          INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
          INNER JOIN cursos c ON m.id_curso = c.id_curso
          WHERE pm.id_pago = ?
        `, [id_pago]);

        if (pagoCompleto.length > 0) {
          const pago = pagoCompleto[0];

          const datosPagoEmail = {
            estudiante_nombre: pago.estudiante_nombre,
            estudiante_apellido: pago.estudiante_apellido,
            estudiante_cedula: pago.estudiante_cedula,
            estudiante_email: pago.estudiante_email,
            curso_nombre: pago.curso_nombre,
            numero_cuota: pago.numero_cuota,
            monto: pago.monto,
            metodo_pago: pago.metodo_pago,
            fecha_pago: pago.fecha_pago
          };

          await enviarNotificacionPagoEstudiante(datosPagoEmail);
          console.log(' Email de notificación de pago enviado al admin');
        }
      } catch (emailError) {
        console.error(' Error enviando email de notificación (no afecta el pago):', emailError);
      }
    });

    // Emitir evento socket para notificar al ADMIN
    try {
      // Obtener info del pago y estudiante
      const [pagoInfo] = await pool.execute(`
        SELECT 
          pm.id_pago,
          pm.numero_cuota,
          pm.monto,
          u.nombre as estudiante_nombre,
          u.apellido as estudiante_apellido,
          c.nombre as curso_nombre
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
        INNER JOIN cursos c ON m.id_curso = c.id_curso
        WHERE pm.id_pago = ?
        LIMIT 1
      `, [id_pago]);

      if (pagoInfo.length > 0) {
        const pago = pagoInfo[0];

        // Notificar a administradores usando el helper
        notificarNuevoPagoPendiente(req, {
          id_pago: pago.id_pago,
          numero_cuota: pago.numero_cuota,
          monto: parseFloat(pago.monto),
          curso_nombre: pago.curso_nombre
        }, {
          nombre: pago.estudiante_nombre,
          apellido: pago.estudiante_apellido
        });

        console.log(` Administradores notificados: nuevo pago pendiente de ${pago.estudiante_nombre} ${pago.estudiante_apellido} (${pago.curso_nombre})`);
      }
    } catch (socketError) {
      console.error(' Error emitiendo evento socket (no afecta el pago):', socketError);
    }

    res.json({
      success: true,
      message: 'Pago registrado exitosamente. Será verificado por el administrador.',
      pago: resultado
    });

  } catch (error) {
    console.error('Error procesando pago:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      error: error.message || 'Error interno del servidor',
      details: error.stack
    });
  }
};

// Obtener comprobante de pago
exports.getComprobante = async (req, res) => {
  try {
    const id_pago = Number(req.params.id_pago);
    const id_estudiante = req.user?.id_usuario;

    if (!id_pago || !id_estudiante) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    const comprobante = await PagosMenualesModel.getComprobante(id_pago, id_estudiante);

    if (!comprobante) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    res.setHeader('Content-Type', comprobante.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${comprobante.filename}"`);
    res.send(comprobante.buffer);

  } catch (error) {
    console.error('Error obteniendo comprobante:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

// Obtener resumen de pagos del estudiante
exports.getResumenPagos = async (req, res) => {
  try {
    const id_estudiante = req.user?.id_usuario;

    if (!id_estudiante) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const resumen = await PagosMenualesModel.getResumenPagos(id_estudiante);
    res.json(resumen);

  } catch (error) {
    console.error('Error obteniendo resumen de pagos:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

// Obtener cursos con pagos pendientes
exports.getCursosConPagosPendientes = async (req, res) => {
  try {
    const id_estudiante = req.user?.id_usuario;

    if (!id_estudiante) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    console.log(` Buscando cursos para estudiante ID: ${id_estudiante}`);
    const cursos = await PagosMenualesModel.getCursosConPagosPendientes(id_estudiante);
    console.log(` Cursos devueltos al frontend:`, JSON.stringify(cursos, null, 2));
    res.json(cursos);

  } catch (error) {
    console.error('Error obteniendo cursos con pagos pendientes:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

// Actualizar decisión del estudiante sobre un curso promocional
exports.actualizarDecisionPromocion = async (req, res) => {
  try {
    const id_matricula = Number(req.params.id_matricula);
    const { decision } = req.body || {};
    const id_estudiante = req.user?.id_usuario;

    const decisionesPermitidas = ['continuar', 'rechazar'];

    if (!id_matricula || !id_estudiante) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    if (!decisionesPermitidas.includes(decision)) {
      return res.status(400).json({ error: 'Decisión no válida' });
    }

    const resultado = await PagosMenualesModel.actualizarDecisionPromocion(
      id_matricula,
      id_estudiante,
      decision
    );

    res.json({
      success: true,
      decision: resultado.decision_estudiante,
      fecha_decision: resultado.fecha_decision,
      fecha_inicio_cobro: resultado.fecha_inicio_cobro,
      meses_gratis: resultado.meses_gratis
    });
  } catch (error) {
    console.error('Error actualizando decisión de promoción:', error);
    res.status(500).json({
      error: error.message || 'No pudimos registrar tu decisión, intenta más tarde'
    });
  }
};

// Generar reporte Excel de pagos mensuales
exports.generarReporteExcel = async (req, res) => {
  try {
    // 1. Obtener todos los pagos con información completa
    const [pagos] = await pool.execute(`
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
        pm.fecha_verificacion,
        u_est.cedula as estudiante_cedula,
        u_est.nombre as estudiante_nombre,
        u_est.apellido as estudiante_apellido,
        u_est.email as estudiante_email,
        c.nombre as curso_nombre,
        c.codigo_curso,
        m.codigo_matricula,
        verificador.nombre as verificado_por_nombre,
        verificador.apellido as verificado_por_apellido,
        r.nombre_rol as verificado_por_rol
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON m.id_matricula = pm.id_matricula
      INNER JOIN usuarios u_est ON u_est.id_usuario = m.id_estudiante
      INNER JOIN cursos c ON c.id_curso = m.id_curso
      LEFT JOIN usuarios verificador ON pm.verificado_por = verificador.id_usuario
      LEFT JOIN roles r ON r.id_rol = verificador.id_rol
      ORDER BY pm.fecha_vencimiento DESC, u_est.apellido, u_est.nombre
    `);

    // 2. Obtener estadísticas generales
    const [estadisticas] = await pool.execute(`
      SELECT 
        COUNT(*) as total_pagos,
        COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pendientes,
        COUNT(CASE WHEN estado = 'pagado' THEN 1 END) as pagados,
        COUNT(CASE WHEN estado = 'verificado' THEN 1 END) as verificados,
        COUNT(CASE WHEN estado = 'vencido' THEN 1 END) as vencidos,
        SUM(monto) as monto_total,
        SUM(CASE WHEN estado = 'verificado' THEN monto ELSE 0 END) as monto_verificado,
        SUM(CASE WHEN estado = 'pendiente' OR estado = 'vencido' THEN monto ELSE 0 END) as monto_pendiente,
        COUNT(CASE WHEN metodo_pago = 'efectivo' THEN 1 END) as pagos_efectivo,
        COUNT(CASE WHEN metodo_pago = 'transferencia' AND numero_comprobante IS NOT NULL THEN 1 END) as pagos_transferencia,
        COUNT(CASE WHEN metodo_pago = 'transferencia' AND numero_comprobante IS NULL THEN 1 END) as pagos_en_espera
      FROM pagos_mensuales
    `);

    // 3. Obtener resumen por curso
    const [resumenPorCurso] = await pool.execute(`
      SELECT 
        c.codigo_curso,
        c.nombre as curso_nombre,
        COUNT(DISTINCT m.id_estudiante) as total_estudiantes,
        COUNT(pm.id_pago) as total_cuotas,
        COALESCE(SUM(pm.monto), 0) as monto_total,
        COALESCE(SUM(CASE WHEN pm.estado = 'verificado' THEN pm.monto ELSE 0 END), 0) as monto_recaudado,
        COALESCE(SUM(CASE WHEN pm.estado = 'pendiente' OR pm.estado = 'vencido' THEN pm.monto ELSE 0 END), 0) as monto_pendiente
      FROM cursos c
      INNER JOIN matriculas m ON m.id_curso = c.id_curso
      LEFT JOIN pagos_mensuales pm ON pm.id_matricula = m.id_matricula
      GROUP BY c.id_curso, c.codigo_curso, c.nombre
      HAVING total_cuotas > 0
      ORDER BY monto_total DESC
    `);

    // 4. Obtener estudiantes con pagos pendientes por curso
    const [estudiantesPendientes] = await pool.execute(`
      SELECT 
        u.nombre as estudiante_nombre,
        u.apellido as estudiante_apellido,
        u.cedula as estudiante_cedula,
        c.nombre as curso_nombre,
        c.codigo_curso,
        COUNT(CASE WHEN pm.estado = 'pendiente' OR pm.estado = 'vencido' THEN 1 END) as cuotas_pendientes,
        COALESCE(SUM(CASE WHEN pm.estado = 'pendiente' OR pm.estado = 'vencido' THEN pm.monto ELSE 0 END), 0) as monto_pendiente
      FROM usuarios u
      INNER JOIN matriculas m ON m.id_estudiante = u.id_usuario
      INNER JOIN cursos c ON c.id_curso = m.id_curso
      LEFT JOIN pagos_mensuales pm ON pm.id_matricula = m.id_matricula
      WHERE (pm.estado = 'pendiente' OR pm.estado = 'vencido')
      GROUP BY u.id_usuario, u.nombre, u.apellido, u.cedula, c.id_curso, c.nombre, c.codigo_curso
      HAVING cuotas_pendientes > 0
      ORDER BY c.nombre, u.apellido, u.nombre
    `);

    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SGA Belleza';
    workbook.created = new Date();

    // ========== HOJA 1: REPORTE FINANCIERO COMPLETO ==========
    const sheet1 = workbook.addWorksheet('Reporte Financiero', {
      properties: { tabColor: { argb: 'FFDC2626' } }
    });

    // Encabezados
    sheet1.columns = [
      { header: 'Código Matrícula', key: 'codigo_mat', width: 18 },
      { header: 'Estudiante', key: 'estudiante', width: 30 },
      { header: 'Identificación', key: 'cedula', width: 15 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Curso', key: 'curso', width: 25 },
      { header: 'Código Curso', key: 'codigo_curso', width: 15 },
      { header: 'Cuota #', key: 'numero_cuota', width: 10 },
      { header: 'Monto', key: 'monto', width: 12 },
      { header: 'Fecha Vencimiento', key: 'fecha_venc', width: 16 },
      { header: 'Fecha Pago', key: 'fecha_pago', width: 16 },
      { header: 'Método Pago', key: 'metodo', width: 15 },
      { header: 'Nro. Comprobante', key: 'comprobante', width: 18 },
      { header: 'Banco', key: 'banco', width: 15 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Verificado Por', key: 'verificado', width: 25 },
      { header: 'Fecha Verificación', key: 'fecha_verif', width: 16 },
      { header: 'Observaciones', key: 'observaciones', width: 30 }
    ];

    // Estilo del encabezado
    sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    sheet1.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDC2626' }
    };
    sheet1.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet1.getRow(1).height = 25;

    // Agregar datos
    pagos.forEach(pago => {
      const metodoPago = pago.metodo_pago === 'efectivo' ? 'Efectivo' :
        (!pago.numero_comprobante ? 'En Espera' : 'Transferencia');

      // Mostrar verificado por: solo nombre si es admin o administrativo
      let verificadoPor = 'N/A';
      if (pago.verificado_por_nombre && pago.verificado_por_rol) {
        const rol = pago.verificado_por_rol.toLowerCase();
        if (rol === 'admin' || rol === 'administrativo') {
          verificadoPor = `${pago.verificado_por_nombre} ${pago.verificado_por_apellido}`;
        }
      }

      sheet1.addRow({
        codigo_mat: pago.codigo_matricula,
        estudiante: `${pago.estudiante_nombre} ${pago.estudiante_apellido}`,
        cedula: pago.estudiante_cedula,
        email: pago.estudiante_email,
        curso: pago.curso_nombre,
        codigo_curso: pago.codigo_curso,
        numero_cuota: pago.numero_cuota,
        monto: `$${parseFloat(pago.monto).toFixed(2)}`,
        fecha_venc: new Date(pago.fecha_vencimiento).toLocaleDateString('es-EC'),
        fecha_pago: pago.fecha_pago ? new Date(pago.fecha_pago).toLocaleDateString('es-EC') : 'Sin pagar',
        metodo: metodoPago,
        comprobante: pago.numero_comprobante || 'N/A',
        banco: pago.banco_comprobante || 'N/A',
        estado: pago.estado.charAt(0).toUpperCase() + pago.estado.slice(1),
        verificado: verificadoPor,
        fecha_verif: pago.fecha_verificacion ? new Date(pago.fecha_verificacion).toLocaleDateString('es-EC') : 'N/A',
        observaciones: pago.observaciones || 'N/A'
      });
    });

    // Aplicar bordes y estilos alternados
    sheet1.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });

      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' }
        };
      }
    });

    // ========== HOJA 2: RESUMEN ESTADÍSTICO ==========
    const sheet2 = workbook.addWorksheet('Resumen Estadístico', {
      properties: { tabColor: { argb: 'FF10B981' } }
    });

    // Título principal
    sheet2.mergeCells('A1:F1');
    sheet2.getCell('A1').value = 'REPORTE ESTADÍSTICO FINANCIERO';
    sheet2.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    sheet2.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDC2626' }
    };
    sheet2.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(1).height = 35;

    // Subtítulo con fecha
    sheet2.mergeCells('A2:F2');
    sheet2.getCell('A2').value = `Generado el: ${new Date().toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
    sheet2.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
    sheet2.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(2).height = 20;

    const stats = estadisticas[0];
    const total = stats.total_pagos;

    // Sección 1: Resumen General de Pagos
    sheet2.mergeCells('A4:D4');
    sheet2.getCell('A4').value = 'RESUMEN GENERAL DE PAGOS';
    sheet2.getCell('A4').font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
    sheet2.getCell('A4').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF2F2' }
    };
    sheet2.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(4).height = 25;

    // Encabezados
    sheet2.getCell('A6').value = 'Estado';
    sheet2.getCell('B6').value = 'Cantidad';
    sheet2.getCell('C6').value = 'Porcentaje';
    sheet2.getCell('D6').value = 'Monto';
    ['A6', 'B6', 'C6', 'D6'].forEach(cell => {
      sheet2.getCell(cell).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      sheet2.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
      sheet2.getCell(cell).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Datos generales
    const datosGenerales = [
      { estado: 'Total Pagos', cantidad: total, monto: stats.monto_total, color: 'FF3B82F6' },
      { estado: '✓ Verificados', cantidad: stats.verificados, monto: stats.monto_verificado, color: 'FF10B981' },
      { estado: '💵 Pagados', cantidad: stats.pagados, monto: 0, color: 'FF3B82F6' },
      { estado: '⏳ Pendientes', cantidad: stats.pendientes, monto: stats.monto_pendiente, color: 'FFF59E0B' },
      { estado: '⚠ Vencidos', cantidad: stats.vencidos, monto: 0, color: 'FFEF4444' }
    ];

    let row = 7;
    datosGenerales.forEach(dato => {
      const porcentaje = total > 0 ? ((dato.cantidad / total) * 100).toFixed(1) : '0.0';
      sheet2.getCell(`A${row}`).value = dato.estado;
      sheet2.getCell(`B${row}`).value = dato.cantidad;
      sheet2.getCell(`C${row}`).value = `${porcentaje}%`;
      sheet2.getCell(`D${row}`).value = `$${parseFloat(dato.monto || 0).toFixed(2)}`;

      sheet2.getCell(`B${row}`).alignment = { horizontal: 'center' };
      sheet2.getCell(`C${row}`).alignment = { horizontal: 'center' };
      sheet2.getCell(`D${row}`).alignment = { horizontal: 'right' };
      sheet2.getCell(`C${row}`).font = { bold: true, color: { argb: dato.color } };
      sheet2.getCell(`D${row}`).font = { bold: true, color: { argb: 'FF10B981' } };

      row++;
    });

    // Métodos de pago
    const startRow2 = row + 2;
    sheet2.mergeCells(`A${startRow2}:C${startRow2}`);
    sheet2.getCell(`A${startRow2}`).value = 'MÉTODOS DE PAGO';
    sheet2.getCell(`A${startRow2}`).font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
    sheet2.getCell(`A${startRow2}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF2F2' }
    };
    sheet2.getCell(`A${startRow2}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(startRow2).height = 25;

    const metodoRow = startRow2 + 2;
    sheet2.getCell(`A${metodoRow}`).value = '💵 Efectivo';
    sheet2.getCell(`B${metodoRow}`).value = stats.pagos_efectivo;
    sheet2.getCell(`C${metodoRow}`).value = `${total > 0 ? ((stats.pagos_efectivo / total) * 100).toFixed(1) : '0.0'}%`;

    sheet2.getCell(`A${metodoRow + 1}`).value = '🏦 Transferencia';
    sheet2.getCell(`B${metodoRow + 1}`).value = stats.pagos_transferencia;
    sheet2.getCell(`C${metodoRow + 1}`).value = `${total > 0 ? ((stats.pagos_transferencia / total) * 100).toFixed(1) : '0.0'}%`;

    sheet2.getCell(`A${metodoRow + 2}`).value = '⏳ En Espera';
    sheet2.getCell(`B${metodoRow + 2}`).value = stats.pagos_en_espera;
    sheet2.getCell(`C${metodoRow + 2}`).value = `${total > 0 ? ((stats.pagos_en_espera / total) * 100).toFixed(1) : '0.0'}%`;
    sheet2.getCell(`B${metodoRow + 2}`).font = { bold: true, color: { argb: 'FFF59E0B' } };
    sheet2.getCell(`C${metodoRow + 2}`).font = { bold: true, color: { argb: 'FFF59E0B' } };

    // Sección 2: Resumen por Curso
    const startRow = row + 8;
    sheet2.mergeCells(`A${startRow}:G${startRow}`);
    sheet2.getCell(`A${startRow}`).value = 'RESUMEN FINANCIERO POR CURSO';
    sheet2.getCell(`A${startRow}`).font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
    sheet2.getCell(`A${startRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF2F2' }
    };
    sheet2.getCell(`A${startRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(startRow).height = 25;

    // Encabezados tabla cursos
    const headerRow = startRow + 2;
    sheet2.getCell(`A${headerRow}`).value = 'Código';
    sheet2.getCell(`B${headerRow}`).value = 'Curso';
    sheet2.getCell(`C${headerRow}`).value = 'Estudiantes';
    sheet2.getCell(`D${headerRow}`).value = 'Total Cuotas';
    sheet2.getCell(`E${headerRow}`).value = 'Monto Total';
    sheet2.getCell(`F${headerRow}`).value = 'Recaudado';
    sheet2.getCell(`G${headerRow}`).value = 'Pendiente';

    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(col => {
      sheet2.getCell(`${col}${headerRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      sheet2.getCell(`${col}${headerRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
      sheet2.getCell(`${col}${headerRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Datos por curso
    let cursoRow = headerRow + 1;
    resumenPorCurso.forEach((curso, index) => {
      sheet2.getCell(`A${cursoRow}`).value = curso.codigo_curso;
      sheet2.getCell(`B${cursoRow}`).value = curso.curso_nombre;
      sheet2.getCell(`C${cursoRow}`).value = curso.total_estudiantes;
      sheet2.getCell(`D${cursoRow}`).value = curso.total_cuotas;
      sheet2.getCell(`E${cursoRow}`).value = `$${parseFloat(curso.monto_total).toFixed(2)}`;
      sheet2.getCell(`F${cursoRow}`).value = `$${parseFloat(curso.monto_recaudado).toFixed(2)}`;
      sheet2.getCell(`G${cursoRow}`).value = `$${parseFloat(curso.monto_pendiente).toFixed(2)}`;

      ['C', 'D'].forEach(col => {
        sheet2.getCell(`${col}${cursoRow}`).alignment = { horizontal: 'center' };
      });
      ['E', 'F', 'G'].forEach(col => {
        sheet2.getCell(`${col}${cursoRow}`).alignment = { horizontal: 'right' };
        sheet2.getCell(`${col}${cursoRow}`).font = { bold: true };
      });
      sheet2.getCell(`F${cursoRow}`).font.color = { argb: 'FF10B981' };
      sheet2.getCell(`G${cursoRow}`).font.color = { argb: 'FFEF4444' };

      // Filas alternadas
      if (index % 2 === 0) {
        ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(col => {
          sheet2.getCell(`${col}${cursoRow}`).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }
          };
        });
      }

      cursoRow++;
    });

    // Sección 3: Estudiantes con Pagos Pendientes
    const startRow3 = cursoRow + 2;
    sheet2.mergeCells(`A${startRow3}:E${startRow3}`);
    sheet2.getCell(`A${startRow3}`).value = '⚠️ ESTUDIANTES CON PAGOS PENDIENTES';
    sheet2.getCell(`A${startRow3}`).font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
    sheet2.getCell(`A${startRow3}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF2F2' }
    };
    sheet2.getCell(`A${startRow3}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(startRow3).height = 25;

    // Encabezados tabla estudiantes pendientes
    const headerRow3 = startRow3 + 2;
    sheet2.getCell(`A${headerRow3}`).value = 'Estudiante';
    sheet2.getCell(`B${headerRow3}`).value = 'Identificación';
    sheet2.getCell(`C${headerRow3}`).value = 'Curso';
    sheet2.getCell(`D${headerRow3}`).value = 'Cuotas Pendientes';
    sheet2.getCell(`E${headerRow3}`).value = 'Monto Pendiente';

    ['A', 'B', 'C', 'D', 'E'].forEach(col => {
      sheet2.getCell(`${col}${headerRow3}`).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      sheet2.getCell(`${col}${headerRow3}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
      sheet2.getCell(`${col}${headerRow3}`).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Datos estudiantes pendientes
    let pendRow = headerRow3 + 1;
    estudiantesPendientes.forEach((est, index) => {
      sheet2.getCell(`A${pendRow}`).value = `${est.estudiante_nombre} ${est.estudiante_apellido}`;
      sheet2.getCell(`B${pendRow}`).value = est.estudiante_cedula;
      sheet2.getCell(`C${pendRow}`).value = `${est.codigo_curso} - ${est.curso_nombre}`;
      sheet2.getCell(`D${pendRow}`).value = est.cuotas_pendientes;
      sheet2.getCell(`E${pendRow}`).value = `$${parseFloat(est.monto_pendiente).toFixed(2)}`;

      sheet2.getCell(`D${pendRow}`).alignment = { horizontal: 'center' };
      sheet2.getCell(`D${pendRow}`).font = { bold: true, color: { argb: 'FFF59E0B' } };
      sheet2.getCell(`E${pendRow}`).alignment = { horizontal: 'right' };
      sheet2.getCell(`E${pendRow}`).font = { bold: true, color: { argb: 'FFEF4444' } };

      // Filas alternadas
      if (index % 2 === 0) {
        ['A', 'B', 'C', 'D', 'E'].forEach(col => {
          sheet2.getCell(`${col}${pendRow}`).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFBEB' }
          };
        });
      }

      pendRow++;
    });

    // Ajustar anchos
    sheet2.getColumn('A').width = 30;
    sheet2.getColumn('B').width = 15;
    sheet2.getColumn('C').width = 35;
    sheet2.getColumn('D').width = 18;
    sheet2.getColumn('E').width = 18;
    sheet2.getColumn('F').width = 15;
    sheet2.getColumn('G').width = 15;

    // Aplicar bordes
    for (let i = 6; i < row; i++) {
      ['A', 'B', 'C', 'D'].forEach(col => {
        sheet2.getCell(`${col}${i}`).border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });
    }

    for (let i = metodoRow; i <= metodoRow + 2; i++) {
      ['A', 'B', 'C'].forEach(col => {
        sheet2.getCell(`${col}${i}`).border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });
    }

    for (let i = headerRow; i < cursoRow; i++) {
      ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(col => {
        sheet2.getCell(`${col}${i}`).border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });
    }

    for (let i = headerRow3; i < pendRow; i++) {
      ['A', 'B', 'C', 'D', 'E'].forEach(col => {
        sheet2.getCell(`${col}${i}`).border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });
    }

    // Generar archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const fecha = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Pagos_${fecha}.xlsx`);
    res.send(buffer);

  } catch (error) {
    console.error('Error generando reporte Excel:', error);
    res.status(500).json({ error: 'Error al generar el reporte', details: error.message });
  }
};
