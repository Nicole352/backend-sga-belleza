const PagosMenualesModel = require('../models/pagos-mensuales.model');

// Obtener cuotas de una matrícula específica
exports.getCuotasByMatricula = async (req, res) => {
  try {
    const id_matricula = Number(req.params.id_matricula);
    const id_estudiante = req.user?.id_usuario;

    if (!id_matricula || !id_estudiante) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    const cuotas = await PagosMenualesModel.getCuotasByMatricula(id_matricula, id_estudiante);
    res.json(cuotas);

  } catch (error) {
    console.error('Error obteniendo cuotas:', error);
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
      observaciones 
    } = req.body;

    const id_estudiante = req.user?.id_usuario;

    console.log('🔍 Procesando pago:', {
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

    // Validaciones básicas
    if (!metodo_pago || !numero_comprobante || !banco_comprobante || !fecha_transferencia) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios: método de pago, número de comprobante, banco y fecha de transferencia'
      });
    }

    // Validar que el método de pago sea válido
    const metodosValidos = ['transferencia', 'efectivo', 'payphone'];
    if (!metodosValidos.includes(metodo_pago)) {
      return res.status(400).json({
        success: false,
        message: 'Método de pago no válido. Debe ser: transferencia, efectivo o payphone'
      });
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

    // Procesar archivo si existe
    let archivoData = null;
    if (req.file) {
      archivoData = {
        comprobanteBuffer: req.file.buffer,
        comprobanteMime: req.file.mimetype,
        comprobanteSizeKb: Math.round(req.file.size / 1024),
        comprobanteNombreOriginal: req.file.originalname
      };
      console.log('✅ Archivo procesado:', archivoData.comprobanteNombreOriginal);
    }

    const pagoData = {
      metodo_pago,
      monto_pagado,
      numero_comprobante,
      banco_comprobante,
      fecha_transferencia,
      observaciones
    };

    const resultado = await PagosMenualesModel.procesarPago(id_pago, pagoData, archivoData, id_estudiante);
    
    console.log('✅ Pago procesado exitosamente:', resultado);

    res.json({
      success: true,
      message: 'Pago registrado exitosamente. Será verificado por el administrador.',
      pago: resultado
    });

  } catch (error) {
    console.error('❌ Error procesando pago:', error);
    console.error('❌ Stack trace:', error.stack);
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

    const cursos = await PagosMenualesModel.getCursosConPagosPendientes(id_estudiante);
    res.json(cursos);

  } catch (error) {
    console.error('Error obteniendo cursos con pagos pendientes:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};
