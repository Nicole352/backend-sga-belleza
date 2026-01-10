const PagosMenualesModel = require('../models/pagos-mensuales.model');
const { enviarNotificacionPagoEstudiante } = require('../services/emailService');
const { emitSocketEvent } = require('../services/socket.service');
const { notificarNuevoPagoPendiente } = require('../utils/notificationHelper');
const { registrarAuditoria } = require('../utils/auditoria');
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
    console.error('❌ Error obteniendo cuotas:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      sql: error.sql,
      id_matricula: req.params.id_matricula,
      id_estudiante: req.user?.id_usuario
    });
    res.status(500).json({
      error: error.message || 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.sqlMessage : undefined
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

    // Subir archivo a Cloudinary si existe (SOLO CLOUDINARY)
    let archivoData = null;
    let comprobanteCloudinary = null;

    if (req.file) {
      try {
        console.log('✓ Subiendo comprobante a Cloudinary...');
        comprobanteCloudinary = await cloudinaryService.uploadFile(
          req.file.buffer,
          'comprobantes',
          `pago-cuota-${id_pago}-${Date.now()}`
        );
        console.log('✓ Comprobante subido a Cloudinary:', comprobanteCloudinary.secure_url);

        archivoData = {
          comprobanteUrl: comprobanteCloudinary.secure_url,
          comprobantePublicId: comprobanteCloudinary.public_id
        };
      } catch (cloudinaryError) {
        console.error('✗ Error subiendo a Cloudinary:', cloudinaryError);
        return res.status(500).json({
          error: 'Error al subir el comprobante. Por favor, intenta nuevamente.'
        });
      }
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

    // Registrar auditoría - Estudiante subió pago
    try {
      // Obtener información completa del pago para la auditoría
      const [pagoCompleto] = await pool.execute(`
        SELECT
          pm.id_pago,
          pm.numero_cuota,
          pm.monto,
          pm.metodo_pago,
          pm.numero_comprobante,
          u.nombre as estudiante_nombre,
          u.apellido as estudiante_apellido,
          c.nombre as curso_nombre,
          c.codigo_curso
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
        INNER JOIN cursos c ON m.id_curso = c.id_curso
        WHERE pm.id_pago = ?
      `, [id_pago]);

      if (pagoCompleto.length > 0) {
        const pago = pagoCompleto[0];
        await registrarAuditoria({
          tabla_afectada: 'pagos_mensuales',
          operacion: 'UPDATE',
          id_registro: id_pago,
          usuario_id: id_estudiante,
          datos_nuevos: {
            id_pago,
            numero_cuota: pago.numero_cuota,
            monto: parseFloat(pago.monto),
            metodo_pago,
            numero_comprobante: numero_comprobante || null,
            banco_comprobante: banco_comprobante || null,
            fecha_transferencia: fecha_transferencia || null,
            curso_nombre: pago.curso_nombre,
            codigo_curso: pago.codigo_curso,
            tiene_comprobante: archivoData ? true : false,
            estado: 'pendiente'
          },
          ip_address: req.ip || req.connection?.remoteAddress || null,
          user_agent: req.get('user-agent') || null
        });
      }
    } catch (auditError) {
      console.error(' Error registrando auditoría de pago (no afecta el pago):', auditError);
    }

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

// NOTA: Los archivos ahora se sirven directamente desde Cloudinary
// Las URLs están disponibles en el campo comprobante_pago_url

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
    // Obtener filtros de la query
    const { estado = '', horario = '', cursoId = '', search = '' } = req.query;

    // 1. Obtener todos los pagos con información completa
    // IMPORTANTE: Ordenar por Estudiante -> Curso -> Cuota para poder agrupar (merge) en Excel
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
        pm.recibido_por,
        pm.observaciones,
        pm.fecha_verificacion,
        u_est.cedula as estudiante_cedula,
        u_est.nombre as estudiante_nombre,
        u_est.apellido as estudiante_apellido,
        u_est.email as estudiante_email,
        c.nombre as curso_nombre,
        c.codigo_curso,
        c.horario as curso_horario,
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
      WHERE 1=1
    `;

    const params = [];

    if (estado) {
      sql += ` AND pm.estado = ?`;
      params.push(estado);
    }

    if (horario) {
      sql += ` AND c.horario = ?`;
      params.push(horario);
    }

    if (cursoId) {
      sql += ` AND c.id_curso = ?`;
      params.push(parseInt(cursoId));
    }

    if (search) {
      sql += ` AND (u_est.nombre LIKE ? OR u_est.apellido LIKE ? OR u_est.cedula LIKE ? OR c.nombre LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    sql += ` ORDER BY u_est.apellido, u_est.nombre, c.nombre, pm.numero_cuota ASC`;

    const [pagos] = await pool.execute(sql, params);

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
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9, // A4 horizontal
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Título Dinámico (Fila 1)
    sheet1.mergeCells(1, 1, 1, 19);
    const titleCell1 = sheet1.getCell(1, 1);
    titleCell1.value = 'REPORTE FINANCIERO DETALLADO';
    titleCell1.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    titleCell1.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(1).height = 25;

    // Info Dinámica (Fila 2)
    sheet1.mergeCells(2, 1, 2, 19);
    const infoCell1 = sheet1.getCell(2, 1);
    const infoText1 = `Filtros: ${estado || 'TODOS'} | Horario: ${horario || 'TODOS'} | Curso: ${cursoId || 'TODOS'} | Generado: ${new Date().toLocaleDateString('es-EC')}`;
    infoCell1.value = infoText1.toUpperCase();
    infoCell1.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCell1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet1.getRow(2).height = 35;

    // Definir columnas (necesario para mapar keys en addRow y getCell)
    sheet1.columns = [
      { key: 'numero', width: 5 },
      { key: 'cedula', width: 20 },
      { key: 'estudiante', width: 22 },
      { key: 'email', width: 22 },
      { key: 'curso', width: 16 },
      { key: 'codigo_curso', width: 10 },
      { key: 'codigo_mat', width: 14 },
      { key: 'numero_cuota', width: 8 },
      { key: 'monto', width: 11 },
      { key: 'fecha_venc', width: 13 },
      { key: 'fecha_pago', width: 13 },
      { key: 'metodo', width: 12 },
      { key: 'recibido_por', width: 16 },
      { key: 'comprobante', width: 14 },
      { key: 'banco', width: 12 },
      { key: 'estado', width: 11 },
      { key: 'verificado', width: 18 },
      { key: 'fecha_verif', width: 13 },
      { key: 'observaciones', width: 22 }
    ];

    // Encabezados - REORDENADOS: #, Identificación, Estudiante, Email, Curso...
    const headers1 = [
      '#', 'IDENTIFICACIÓN', 'ESTUDIANTE', 'EMAIL', 'CURSO', 'COD. CURSO', 'COD. MATRÍCULA', 'CUOTA #',
      'MONTO', 'VENCIMIENTO', 'FECHA PAGO', 'MÉTODO', 'RECIBIDO POR', 'NRO. COMPROBANTE', 'BANCO',
      'ESTADO', 'VERIFICADO POR', 'FECHA VERIF.', 'OBSERVACIONES'
    ];
    const headerRow1 = sheet1.getRow(4);
    headerRow1.height = 35;
    headers1.forEach((h, i) => {
      const cell = headerRow1.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FF000000' }, size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });


    // Agregar datos con agrupación y MERGE
    let estudianteCursoAnterior = null; // Clave única: cedula + codigo_curso + id_matricula
    let numeroEstudiante = 0;
    const startDataRow = 5; // Fila donde comienzan los datos (Header está en 4)
    let filaInicioEstudiante = startDataRow;
    let currentRow = startDataRow;

    pagos.forEach((pago, index) => {
      // Clave para identificar si es el mismo grupo (Estudiante en un Curso específico y Matrícula específica)
      // Se añade pago.id_matricula (o codigo_matricula) para diferenciar re-inscripciones en el mismo curso
      const claveActual = `${pago.estudiante_cedula}-${pago.codigo_curso}-${pago.codigo_matricula}`;
      const esNuevoGrupo = estudianteCursoAnterior !== claveActual;
      const esUltimoRegistro = index === pagos.length - 1;

      // Verificar si el siguiente registro es diferente para saber cuándo cerrar el merge
      let siguienteEsDiferente = esUltimoRegistro;
      if (!esUltimoRegistro) {
        const siguientePago = pagos[index + 1];
        const claveSiguiente = `${siguientePago.estudiante_cedula}-${siguientePago.codigo_curso}-${siguientePago.codigo_matricula}`;
        siguienteEsDiferente = claveActual !== claveSiguiente;
      }

      if (esNuevoGrupo) {
        numeroEstudiante++;
        filaInicioEstudiante = currentRow;
      }

      const metodoPago = pago.metodo_pago === 'efectivo' ? 'Efectivo' :
        (!pago.numero_comprobante ? 'En Espera' : 'Transferencia');

      let verificadoPor = 'N/A';
      if (pago.verificado_por_nombre && pago.verificado_por_apellido) {
        verificadoPor = `${pago.verificado_por_apellido} ${pago.verificado_por_nombre}`;
      }

      // Agregar fila
      const row = sheet1.addRow({
        numero: esNuevoGrupo ? numeroEstudiante : '',
        cedula: esNuevoGrupo ? pago.estudiante_cedula : '',
        estudiante: esNuevoGrupo ? (`${pago.estudiante_apellido} ${pago.estudiante_nombre}`).toUpperCase() : '', // Apellidos primero
        email: esNuevoGrupo ? (pago.estudiante_email ? pago.estudiante_email.toLowerCase() : '') : '',
        curso: esNuevoGrupo ? (pago.curso_nombre ? pago.curso_nombre.toUpperCase() : '') : '',
        codigo_curso: esNuevoGrupo ? (pago.codigo_curso ? pago.codigo_curso.toUpperCase() : '') : '',
        codigo_mat: esNuevoGrupo ? (pago.codigo_matricula ? pago.codigo_matricula.toUpperCase() : '') : '',
        numero_cuota: Number(pago.numero_cuota),
        monto: parseFloat(pago.monto), // Convertir a número para formato moneda
        fecha_venc: new Date(pago.fecha_vencimiento),
        fecha_pago: pago.fecha_pago ? new Date(pago.fecha_pago) : 'SIN PAGAR',
        metodo: metodoPago.toUpperCase(),
        recibido_por: (pago.recibido_por ? pago.recibido_por.toUpperCase() : 'N/A'),
        comprobante: (pago.numero_comprobante ? pago.numero_comprobante.toUpperCase() : 'N/A'),
        banco: (pago.banco_comprobante ? pago.banco_comprobante.toUpperCase() : 'N/A'),
        estado: (pago.estado ? pago.estado.toUpperCase() : 'N/A'),
        verificado: verificadoPor.toUpperCase(),
        fecha_verif: pago.fecha_verificacion ? new Date(pago.fecha_verificacion) : 'N/A',
        observaciones: (pago.observaciones ? pago.observaciones.toUpperCase() : 'N/A')
      });

      // --- APLICAR FORMATOS ---

      // Formatos de columnas de estudiante (solo si es nuevo grupo, aunque el merge lo cubrirá)
      if (esNuevoGrupo) {
        row.getCell('numero').numFmt = '0';
        row.getCell('numero').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('cedula').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('codigo_curso').alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // Formatos de columnas de pago (siempre)
      row.getCell('numero_cuota').numFmt = '0';
      row.getCell('numero_cuota').alignment = { horizontal: 'center', vertical: 'middle' };

      row.getCell('monto').numFmt = '$#,##0.00';
      row.getCell('monto').alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell('fecha_venc').numFmt = 'dd/mm/yyyy';
      row.getCell('fecha_venc').alignment = { horizontal: 'center', vertical: 'middle' };

      // Fecha Pago puede ser texto 'Sin pagar' o Fecha
      if (pago.fecha_pago) {
        row.getCell('fecha_pago').numFmt = 'dd/mm/yyyy';
        row.getCell('fecha_pago').alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        row.getCell('fecha_pago').alignment = { horizontal: 'center', vertical: 'middle' };
      }

      if (pago.fecha_verificacion) {
        row.getCell('fecha_verif').numFmt = 'dd/mm/yyyy';
      }
      row.getCell('fecha_verif').alignment = { horizontal: 'center', vertical: 'middle' };

      row.getCell('metodo').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('estado').alignment = { horizontal: 'center', vertical: 'middle' };

      // --- MERGE LOGIC ---
      if (siguienteEsDiferente && currentRow > filaInicioEstudiante) {
        // Columnas a combinar: A(#), B(Cédula), C(Estudiante), D(Email), E(Curso), F(Cod Curso), G(Cod Matrícula)
        const columnasMerge = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        columnasMerge.forEach(col => {
          try {
            sheet1.mergeCells(`${col}${filaInicioEstudiante}:${col}${currentRow}`);
            // Alinear verticalmente al medio después del merge
            const cell = sheet1.getCell(`${col}${filaInicioEstudiante}`);
            cell.alignment = {
              horizontal: cell.alignment?.horizontal || 'left',
              vertical: 'middle',
              wrapText: true
            };
          } catch (e) {
            // Ignorar si ya está mergeado
          }
        });
      }

      estudianteCursoAnterior = claveActual;
      currentRow++;
    });

    // Aplicar bordes y estilos alternados
    sheet1.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        // Asegurar color de fuente negro en todos los datos
        if (rowNumber > 4) { // Asumiendo que datos empiezan después del header
          cell.font = Object.assign({}, cell.font || {}, { color: { argb: 'FF000000' } });
        }
      });
      // Eliminado el patrón de colores alternos para mantener estilo B/N
    });

    // ========== HOJA 2: RESUMEN ESTADÍSTICO ==========
    const sheet2 = workbook.addWorksheet('Resumen Estadístico', {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9, // A4 horizontal
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Configurar anchos de columna para evitar que el texto se corte
    sheet2.getColumn('A').width = 18; // Identificación
    sheet2.getColumn('B').width = 35; // Estudiante (más ancho para nombres completos)
    sheet2.getColumn('C').width = 40; // Curso (más ancho para nombres completos como "Maquillaje Profesional")
    sheet2.getColumn('D').width = 16; // Cuotas Pendientes
    sheet2.getColumn('E').width = 16; // Monto Pendiente
    sheet2.getColumn('F').width = 15; // (columna extra si existe)
    sheet2.getColumn('G').width = 15; // (columna extra si existe)

    // Título principal
    sheet2.mergeCells('A1:E1');
    sheet2.getCell('A1').value = 'REPORTE ESTADÍSTICO FINANCIERO';
    sheet2.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    sheet2.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(1).height = 25;

    // Subtítulo con fecha
    sheet2.mergeCells('A2:E2');
    sheet2.getCell('A2').value = `GENERADO: ${new Date().toLocaleDateString('es-EC')}`;
    sheet2.getCell('A2').font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    sheet2.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(2).height = 25;

    // --- TABLA 1: RESUMEN GENERAL ---
    sheet2.mergeCells('A4:E4');
    const titleResumen = sheet2.getCell('A4');
    titleResumen.value = 'RESUMEN GENERAL';
    titleResumen.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
    titleResumen.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // Blanco
    titleResumen.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };
    titleResumen.alignment = { horizontal: 'center', vertical: 'middle' };

    // Encabezados Resumen
    const headersResumen = ['CONCEPTO', 'CANTIDAD', 'MONTO TOTAL'];
    const rowHeaderResumen = sheet2.getRow(5);
    headersResumen.forEach((h, i) => {
      // Usamos columnas A, B, C para esta tablita
      const cell = rowHeaderResumen.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FF000000' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Datos Resumen
    if (estadisticas.length > 0) {
      const stats = estadisticas[0];
      const dataResumen = [
        ['Total Recaudado (Verificado)', stats.verificados, parseFloat(stats.monto_verificado)],
        ['Total Pendiente por Cobrar', stats.pendientes + stats.vencidos, parseFloat(stats.monto_pendiente)],
        ['Pagos en Efectivo', stats.pagos_efectivo, null],
        ['Pagos por Transferencia', stats.pagos_transferencia, null]
      ];

      dataResumen.forEach((d, i) => {
        const r = sheet2.getRow(6 + i);
        r.getCell(1).value = d[0];
        r.getCell(2).value = d[1];
        r.getCell(3).value = d[2];

        // Estilos
        [1, 2, 3].forEach(c => {
          const cell = r.getCell(c);
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
          cell.font = { color: { argb: 'FF000000' } };
        });

        r.getCell(3).numFmt = '$#,##0.00';
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Financiero_${new Date().toISOString().split('T')[0]}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error generando reporte Excel:', error);
    res.status(500).json({ error: 'Error generando reporte Excel' });
  }
};


// Generar reporte Excel para ESTUDIANTE (Solo sus propios datos)
exports.generarReporteEstudiante = async (req, res) => {
  try {
    const id_estudiante = req.user?.id_usuario;

    if (!id_estudiante) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // 1. Obtener pagos del estudiante
    const sql = `
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
        pm.recibido_por,
        pm.observaciones,
        pm.fecha_verificacion,
        c.nombre as curso_nombre,
        c.codigo_curso,
        c.horario as curso_horario,
        m.codigo_matricula,
        verificador.nombre as verificado_por_nombre,
        verificador.apellido as verificado_por_apellido
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON m.id_matricula = pm.id_matricula
      INNER JOIN cursos c ON c.id_curso = m.id_curso
      LEFT JOIN usuarios verificador ON pm.verificado_por = verificador.id_usuario
      WHERE m.id_estudiante = ?
      ORDER BY c.nombre, pm.numero_cuota ASC
    `;

    const [pagos] = await pool.execute(sql, [id_estudiante]);

    // 2. Obtener datos del estudiante para el encabezado
    const [estudianteInfo] = await pool.execute(
      'SELECT nombre, apellido, cedula, email FROM usuarios WHERE id_usuario = ?',
      [id_estudiante]
    );
    const estudiante = estudianteInfo[0] || {};

    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SGA Belleza';
    workbook.created = new Date();

    // ========== HOJA 1: MIS PAGOS ==========
    const sheet1 = workbook.addWorksheet('Mis Pagos', {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9, // A4 horizontal
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Título (Fila 1)
    sheet1.mergeCells('A1:M1');
    const titleCell = sheet1.getCell('A1');
    titleCell.value = 'REPORTE DE PAGOS - ESTUDIANTE';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF000000' }, name: 'Calibri' }; // NEGRO
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(1).height = 30;

    // Info Estudiante (Fila 2)
    sheet1.mergeCells('A2:M2');
    const subTitle = sheet1.getCell('A2');
    subTitle.value = `ESTUDIANTE: ${estudiante.apellido || ''} ${estudiante.nombre || ''} | ID: ${estudiante.cedula || ''} | GENERADO: ${new Date().toLocaleDateString('es-EC')}`;
    subTitle.value = subTitle.value.toUpperCase(); // Asegurar mayúsculas
    subTitle.font = { bold: true, size: 11, color: { argb: 'FF000000' }, name: 'Calibri' }; // NEGRO
    subTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(2).height = 25;

    // Encabezados (Fila 4)
    const headers = [
      '#', 'CURSO', 'CÓDIGO CURSO', 'CUOTA #', 'MONTO', 'VENCIMIENTO', 'FECHA PAGO',
      'MÉTODO', 'COMPROBANTE', 'ESTADO', 'VERIFICADO POR', 'OBSERVACIONES'
    ];

    // Asignar anchos de columna
    sheet1.columns = [
      { key: 'index', width: 5 },
      { key: 'curso', width: 25 },
      { key: 'cod_curso', width: 15 },
      { key: 'cuota', width: 10 },
      { key: 'monto', width: 12 },
      { key: 'venc', width: 15 },
      { key: 'f_pago', width: 15 },
      { key: 'metodo', width: 15 },
      { key: 'comprobante', width: 18 },
      { key: 'estado', width: 15 },
      { key: 'verificador', width: 25 },
      { key: 'obs', width: 30 }
    ];

    const headerRow = sheet1.getRow(4);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' }; // NEGRO
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // BLANCO
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 30;

    // Datos
    pagos.forEach((p, index) => {
      const row = sheet1.addRow({
        index: index + 1,
        curso: p.curso_nombre ? p.curso_nombre.toUpperCase() : '',
        cod_curso: p.codigo_curso,
        cuota: Number(p.numero_cuota),
        monto: Number(p.monto),
        venc: new Date(p.fecha_vencimiento),
        f_pago: p.fecha_pago ? new Date(p.fecha_pago) : 'PENDIENTE',
        metodo: p.fecha_pago ? (p.metodo_pago ? p.metodo_pago.toUpperCase() : '-') : 'PENDIENTE',
        comprobante: p.numero_comprobante || '-',
        estado: p.estado || 'PENDIENTE',
        verificador: p.verificado_por_nombre ? `${p.verificado_por_apellido.toUpperCase()} ${p.verificado_por_nombre.toUpperCase()}` : '-',
        obs: p.observaciones ? p.observaciones.toUpperCase() : '-'
      });

      // Estilos de celda (Bordes negros finos, Fuente Calibri negra)
      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };

        // Alineación específica
        if ([1, 2, 3, 4, 5, 6, 7, 8, 9].includes(colNum)) { // Índice, Curso, Codigo, Cuota, Monto, Fechas, Estado
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }

        // Formatos
        if (colNum === 5) cell.numFmt = '$#,##0.00'; // Monto
        if (colNum === 6 || (colNum === 7 && p.fecha_pago)) cell.numFmt = 'dd/mm/yyyy'; // Fechas

        // Color de estado
        if (colNum === 10) { // Columna Estado
          cell.value = (p.estado || 'PENDIENTE').toUpperCase();
          cell.font = { bold: true, color: { argb: 'FF000000' } }; // Texto negro siempre
        }
      });
    });

    // Post-procesamiento 1: Combinar celdas de "CURSO" (Columna 2 / B) y "CÓDIGO" (Columna 3 / C)
    let rowCurso = 5;
    while (rowCurso <= sheet1.lastRow.number) {
      let nextRow = rowCurso + 1;
      const cellCurso = sheet1.getCell(`B${rowCurso}`);
      const valCurso = cellCurso.value;

      if (valCurso) {
        while (nextRow <= sheet1.lastRow.number) {
          const nextCell = sheet1.getCell(`B${nextRow}`);
          if (nextCell.value === valCurso) {
            nextRow++;
          } else {
            break;
          }
        }

        if (nextRow > rowCurso + 1) {
          const endRow = nextRow - 1;
          sheet1.mergeCells(`B${rowCurso}:B${endRow}`); // Curso
          sheet1.mergeCells(`C${rowCurso}:C${endRow}`); // Código Curso
          rowCurso = nextRow;
        } else {
          rowCurso++;
        }
      } else {
        rowCurso++;
      }
    }

    // Post-procesamiento 2: Combinar celdas de "COMPROBANTE" (Columna 9 / I)
    let currentRow = 5; // Primera fila de datos
    while (currentRow <= sheet1.lastRow.number) {
      let nextRow = currentRow + 1;
      const currentCell = sheet1.getCell(`I${currentRow}`);
      const currentVal = currentCell.value;

      // Solo combinar si hay valor y no es guión
      if (currentVal && currentVal !== '-') {
        while (nextRow <= sheet1.lastRow.number) {
          const nextCell = sheet1.getCell(`I${nextRow}`);
          if (nextCell.value === currentVal) {
            nextRow++;
          } else {
            break;
          }
        }

        // Si encontramos duplicados consecutivos
        if (nextRow > currentRow + 1) {
          const endRow = nextRow - 1;
          sheet1.mergeCells(`I${currentRow}:I${endRow}`);

          // Combinar también columnas relacionas con la transacción (Fecha Pago, Metodo, Estado, Verificador, Observaciones)
          sheet1.mergeCells(`G${currentRow}:G${endRow}`); // Fecha Pago
          sheet1.mergeCells(`H${currentRow}:H${endRow}`); // Metodo
          sheet1.mergeCells(`J${currentRow}:J${endRow}`); // Estado
          sheet1.mergeCells(`K${currentRow}:K${endRow}`); // Verificado Por
          sheet1.mergeCells(`L${currentRow}:L${endRow}`); // Observaciones

          currentRow = nextRow;
        } else {
          currentRow++;
        }
      } else {
        currentRow++;
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Mis_Pagos_${estudiante.cedula}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error generando reporte estudiante:', error);
    res.status(500).json({ error: 'Error generando reporte' });
  }
};
