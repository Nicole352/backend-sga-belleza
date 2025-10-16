const { pool } = require('../config/database');

class PagosMenualesModel {
  // Obtener pagos mensuales de un estudiante
  static async getMisPagosMenuales(id_estudiante) {
    const [pagos] = await pool.execute(`
      SELECT 
        pm.id_pago,
        pm.id_matricula,
        pm.numero_cuota,
        pm.monto,
        pm.fecha_vencimiento,
        pm.fecha_pago,
        pm.numero_comprobante,
        pm.banco_comprobante,
        pm.fecha_transferencia,
        pm.recibido_por,
        pm.metodo_pago,
        pm.estado,
        c.nombre as curso_nombre,
        c.codigo_curso,
        tc.nombre as tipo_curso_nombre,
        m.codigo_matricula
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      WHERE m.id_estudiante = ?
      ORDER BY pm.fecha_vencimiento ASC, pm.numero_cuota ASC
    `, [id_estudiante]);

    return pagos;
  }

  // Obtener cuotas de una matrícula específica
  static async getCuotasByMatricula(id_matricula, id_estudiante) {
    // Verificar que la matrícula pertenece al estudiante
    const [verificacion] = await pool.execute(`
      SELECT m.id_matricula 
      FROM matriculas m 
      WHERE m.id_matricula = ? AND m.id_estudiante = ?
    `, [id_matricula, id_estudiante]);

    if (verificacion.length === 0) {
      throw new Error('Matrícula no encontrada o no pertenece al estudiante');
    }

    const [cuotas] = await pool.execute(`
      SELECT 
        pm.id_pago,
        pm.numero_cuota,
        pm.monto,
        pm.fecha_vencimiento,
        pm.fecha_pago,
        pm.numero_comprobante,
        pm.recibido_por,
        pm.estado,
        pm.observaciones,
        c.nombre as curso_nombre,
        tc.nombre as tipo_curso_nombre,
        tc.modalidad_pago,
        tc.numero_clases,
        tc.precio_por_clase
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      WHERE pm.id_matricula = ?
      ORDER BY pm.numero_cuota ASC
    `, [id_matricula]);

    return cuotas;
  }

  // Obtener información de un pago específico
  static async getPagoById(id_pago, id_estudiante) {
    const [pagos] = await pool.execute(`
      SELECT 
        pm.*,
        c.nombre as curso_nombre,
        tc.nombre as tipo_curso_nombre,
        m.codigo_matricula
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      WHERE pm.id_pago = ? AND m.id_estudiante = ?
    `, [id_pago, id_estudiante]);

    return pagos.length > 0 ? pagos[0] : null;
  }

  // Procesar pago de mensualidad con múltiples cuotas automáticas
  static async procesarPago(id_pago, pagoData, archivoData, id_estudiante) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Obtener información completa de la cuota actual, matrícula y tipo de curso
      const [pagoInfo] = await connection.execute(`
        SELECT 
          pm.id_pago, pm.estado, pm.monto, pm.numero_cuota, pm.id_matricula, 
          m.id_estudiante, m.id_tipo_curso,
          tc.modalidad_pago, tc.numero_clases, tc.precio_por_clase
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        INNER JOIN tipos_cursos tc ON m.id_tipo_curso = tc.id_tipo_curso
        WHERE pm.id_pago = ? AND m.id_estudiante = ? AND pm.estado IN ('pendiente', 'vencido')
      `, [id_pago, id_estudiante]);

      if (pagoInfo.length === 0) {
        throw new Error('Pago no encontrado, ya procesado o no pertenece al estudiante');
      }

      const cuotaActual = pagoInfo[0];
      const montoPagado = parseFloat(pagoData.monto_pagado) || cuotaActual.monto;
      const montoCuota = parseFloat(cuotaActual.monto);
      const modalidadPago = cuotaActual.modalidad_pago || 'mensual';

      console.log(`💰 Monto pagado: $${montoPagado}, Monto por cuota: $${montoCuota}`);
      console.log(`📊 Modalidad de pago: ${modalidadPago}`);

      // Lógica diferente según modalidad de pago
      if (modalidadPago === 'clases') {
        // ========================================
        // MODALIDAD POR CLASES - PAGO INDIVIDUAL
        // ========================================
        console.log('🎯 Procesando pago por CLASE individual');
        
        // Para cursos por clases, solo se paga UNA clase a la vez
        // No se permite pagar múltiples clases de una vez
        if (Math.abs(montoPagado - montoCuota) > 0.01) {
          throw new Error(`Para cursos por clases, debe pagar exactamente $${montoCuota.toFixed(2)} por esta clase`);
        }

        // Procesar solo esta cuota específica
        const numeroCuotasACubrir = 1;
        const cuotasPendientes = [cuotaActual];
        
      } else {
        // ========================================
        // MODALIDAD MENSUAL - MÚLTIPLES CUOTAS
        // ========================================
        console.log('📅 Procesando pago MENSUAL (puede cubrir múltiples cuotas)');
        
        // Calcular cuántas cuotas cubre el monto pagado
        var numeroCuotasACubrir = Math.floor(montoPagado / montoCuota);
      }
      
      console.log(`📊 Cuotas a cubrir: ${numeroCuotasACubrir}`);

      // Obtener cuotas pendientes según modalidad
      let cuotasPendientes;
      
      if (modalidadPago === 'clases') {
        // Para clases: solo la cuota específica seleccionada
        cuotasPendientes = [cuotaActual];
      } else {
        // Para mensual: obtener múltiples cuotas desde la actual
        const [cuotasResult] = await connection.execute(`
          SELECT id_pago, numero_cuota, monto
          FROM pagos_mensuales
          WHERE id_matricula = ? 
            AND numero_cuota >= ?
            AND estado IN ('pendiente', 'vencido')
          ORDER BY numero_cuota ASC
          LIMIT ${numeroCuotasACubrir}
        `, [cuotaActual.id_matricula, cuotaActual.numero_cuota]);
        
        cuotasPendientes = cuotasResult;
      }

      if (cuotasPendientes.length === 0) {
        throw new Error('No hay cuotas pendientes para procesar');
      }

      // Verificar que el número de comprobante sea único
      if (pagoData.numero_comprobante) {
        const idsPendientes = cuotasPendientes.map(c => c.id_pago);
        const placeholders = idsPendientes.map(() => '?').join(',');
        
        const [existingComprobante] = await connection.execute(`
          SELECT id_pago FROM pagos_mensuales 
          WHERE numero_comprobante = ? AND id_pago NOT IN (${placeholders})
        `, [pagoData.numero_comprobante.trim().toUpperCase(), ...idsPendientes]);

        if (existingComprobante.length > 0) {
          throw new Error('Este número de comprobante ya fue utilizado en otro pago');
        }
      }

      // Marcar todas las cuotas cubiertas como "pagado"
      for (let i = 0; i < cuotasPendientes.length; i++) {
        const cuota = cuotasPendientes[i];
        const esPrimera = i === 0;

        let observacionesFinal = pagoData.observaciones || '';
        
        if (modalidadPago === 'clases') {
          // Observaciones para cursos por clases
          observacionesFinal = `Pago de clase #${cuota.numero_cuota} - $${montoPagado.toFixed(2)}${observacionesFinal ? '\n' + observacionesFinal : ''}`;
        } else {
          // Observaciones para cursos mensuales (lógica original)
          if (esPrimera) {
            observacionesFinal = `Monto pagado: $${montoPagado.toFixed(2)} (cubre ${numeroCuotasACubrir} cuota(s))${observacionesFinal ? '\n' + observacionesFinal : ''}`;
          } else {
            observacionesFinal = `Cubierto por pago de cuota #${cuotaActual.numero_cuota} ($${montoPagado.toFixed(2)})`;
          }
        }

        const updateQuery = `
          UPDATE pagos_mensuales 
          SET 
            estado = 'pagado',
            metodo_pago = ?,
            numero_comprobante = ?,
            banco_comprobante = ?,
            fecha_transferencia = ?,
            recibido_por = ?,
            fecha_pago = NOW(),
            comprobante_pago_blob = ?,
            comprobante_mime = ?,
            comprobante_size_kb = ?,
            comprobante_nombre_original = ?,
            observaciones = ?
          WHERE id_pago = ?
        `;

        await connection.execute(updateQuery, [
          pagoData.metodo_pago,
          esPrimera ? pagoData.numero_comprobante?.trim().toUpperCase() : null,
          esPrimera ? pagoData.banco_comprobante : null,
          esPrimera ? pagoData.fecha_transferencia : null,
          esPrimera ? pagoData.recibido_por : null,
          esPrimera && archivoData ? archivoData.comprobanteBuffer : null,
          esPrimera && archivoData ? archivoData.comprobanteMime : null,
          esPrimera && archivoData ? archivoData.comprobanteSizeKb : null,
          esPrimera && archivoData ? archivoData.comprobanteNombreOriginal : null,
          observacionesFinal,
          cuota.id_pago
        ]);

        console.log(`✅ Cuota #${cuota.numero_cuota} marcada como pagado`);
      }

      await connection.commit();
      
      // Mensaje específico según modalidad
      let mensaje;
      if (modalidadPago === 'clases') {
        mensaje = `Pago de clase procesado exitosamente. Clase #${cuotaActual.numero_cuota} pagada.`;
      } else {
        mensaje = `Pago procesado exitosamente. ${numeroCuotasACubrir} cuota(s) marcada(s) como pagado.`;
      }
      
      return { 
        success: true, 
        message: mensaje,
        cuotas_cubiertas: numeroCuotasACubrir,
        modalidad_pago: modalidadPago
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Obtener comprobante de pago
  static async getComprobante(id_pago, id_estudiante) {
    const [pagos] = await pool.execute(`
      SELECT 
        pm.comprobante_pago_blob,
        pm.comprobante_mime,
        pm.comprobante_nombre_original
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      WHERE pm.id_pago = ? AND m.id_estudiante = ?
    `, [id_pago, id_estudiante]);

    if (pagos.length === 0 || !pagos[0].comprobante_pago_blob) {
      return null;
    }

    return {
      buffer: pagos[0].comprobante_pago_blob,
      mime: pagos[0].comprobante_mime || 'application/octet-stream',
      filename: pagos[0].comprobante_nombre_original || `comprobante-pago-${id_pago}`
    };
  }

  // Verificar si existe número de comprobante
  static async existsNumeroComprobante(numero_comprobante, exclude_id_pago = null) {
    let sql = 'SELECT id_pago FROM pagos_mensuales WHERE numero_comprobante = ?';
    const params = [numero_comprobante.trim().toUpperCase()];

    if (exclude_id_pago) {
      sql += ' AND id_pago != ?';
      params.push(exclude_id_pago);
    }

    const [existing] = await pool.execute(sql, params);
    return existing.length > 0;
  }

  // Obtener resumen de pagos por estudiante
  static async getResumenPagos(id_estudiante) {
    try {
      const [resumen] = await pool.execute(`
        SELECT 
          COUNT(*) as total_cuotas,
          SUM(CASE WHEN pm.estado = 'pagado' THEN 1 ELSE 0 END) as cuotas_pagadas,
          SUM(CASE WHEN pm.estado = 'pendiente' THEN 1 ELSE 0 END) as cuotas_pendientes,
          SUM(CASE WHEN pm.estado = 'vencido' THEN 1 ELSE 0 END) as cuotas_vencidas,
          SUM(CASE WHEN pm.estado = 'verificado' THEN 1 ELSE 0 END) as cuotas_verificadas,
          SUM(pm.monto) as monto_total,
          SUM(CASE WHEN pm.estado IN ('pagado', 'verificado') THEN pm.monto ELSE 0 END) as monto_pagado,
          SUM(CASE WHEN pm.estado IN ('pendiente', 'vencido') THEN pm.monto ELSE 0 END) as monto_pendiente
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        WHERE m.id_estudiante = ?
      `, [id_estudiante]);

      // Si no hay datos, devolver valores por defecto
      const resultado = resumen[0] || {};
      
      return {
        total_cuotas: parseInt(resultado.total_cuotas) || 0,
        cuotas_pagadas: parseInt(resultado.cuotas_pagadas) || 0,
        cuotas_pendientes: parseInt(resultado.cuotas_pendientes) || 0,
        cuotas_vencidas: parseInt(resultado.cuotas_vencidas) || 0,
        cuotas_verificadas: parseInt(resultado.cuotas_verificadas) || 0,
        monto_total: parseFloat(resultado.monto_total) || 0,
        monto_pagado: parseFloat(resultado.monto_pagado) || 0,
        monto_pendiente: parseFloat(resultado.monto_pendiente) || 0
      };
    } catch (error) {
      console.error('Error en getResumenPagos:', error);
      // En caso de error, devolver valores por defecto
      return {
        total_cuotas: 0,
        cuotas_pagadas: 0,
        cuotas_pendientes: 0,
        cuotas_vencidas: 0,
        cuotas_verificadas: 0,
        monto_total: 0,
        monto_pagado: 0,
        monto_pendiente: 0
      };
    }
  }

  // Obtener cursos con pagos pendientes
  static async getCursosConPagosPendientes(id_estudiante) {
    try {
      const [cursos] = await pool.execute(`
        SELECT 
          m.id_matricula,
          m.codigo_matricula,
          c.nombre as curso_nombre,
          c.codigo_curso,
          tc.nombre as tipo_curso_nombre,
          COUNT(pm.id_pago) as total_cuotas,
          SUM(CASE WHEN pm.estado = 'pendiente' THEN 1 ELSE 0 END) as cuotas_pendientes,
          SUM(CASE WHEN pm.estado = 'vencido' THEN 1 ELSE 0 END) as cuotas_vencidas,
          MIN(CASE WHEN pm.estado IN ('pendiente', 'vencido') THEN pm.fecha_vencimiento END) as proxima_fecha_vencimiento,
          SUM(CASE WHEN pm.estado IN ('pendiente', 'vencido') THEN pm.monto ELSE 0 END) as monto_pendiente
        FROM matriculas m
        INNER JOIN cursos c ON m.id_curso = c.id_curso
        INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
        LEFT JOIN pagos_mensuales pm ON m.id_matricula = pm.id_matricula
        WHERE m.id_estudiante = ? AND m.estado = 'activa'
        GROUP BY m.id_matricula, m.codigo_matricula, c.nombre, c.codigo_curso, tc.nombre
        HAVING cuotas_pendientes > 0 OR cuotas_vencidas > 0
        ORDER BY proxima_fecha_vencimiento ASC
      `, [id_estudiante]);

      return cursos || [];
    } catch (error) {
      console.error('Error en getCursosConPagosPendientes:', error);
      return [];
    }
  }
  // Validar que una cuota pertenece a un estudiante
  static async validarCuotaEstudiante(id_pago, id_estudiante) {
    try {
      const [result] = await pool.execute(`
        SELECT pm.id_pago
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        WHERE pm.id_pago = ? AND m.id_estudiante = ?
      `, [id_pago, id_estudiante]);
      
      return result.length > 0;
    } catch (error) {
      console.error('Error validando cuota estudiante:', error);
      return false;
    }
  }

  // Verificar si existe un número de comprobante
  static async existeNumeroComprobante(numero_comprobante, exclude_id_pago = null) {
    try {
      let sql = 'SELECT id_pago FROM pagos_mensuales WHERE numero_comprobante = ?';
      let params = [numero_comprobante];
      
      if (exclude_id_pago) {
        sql += ' AND id_pago != ?';
        params.push(exclude_id_pago);
      }
      
      const [result] = await pool.execute(sql, params);
      return result.length > 0;
    } catch (error) {
      console.error('Error verificando número comprobante:', error);
      return false;
    }
  }

  // Registrar pago de mensualidad
  static async registrarPago(id_pago, pagoData, archivoData = null) {
    try {
      console.log('🔍 DEBUG registrarPago - pagoData recibido:', pagoData);
      
      // Obtener el monto original de la cuota antes de actualizar
      const [cuotaOriginal] = await pool.execute(
        'SELECT monto FROM pagos_mensuales WHERE id_pago = ?',
        [id_pago]
      );

      const montoOriginal = parseFloat(cuotaOriginal[0]?.monto) || 0;
      console.log('💰 Monto original de la cuota:', montoOriginal);
      
      // Determinar el monto final a guardar
      let montoFinal = montoOriginal;
      let observacionesFinal = pagoData.observaciones || '';
      
      if (pagoData.monto_pagado && parseFloat(pagoData.monto_pagado) > 0) {
        const montoPagadoNum = parseFloat(pagoData.monto_pagado);
        montoFinal = montoPagadoNum;
        console.log('💵 Monto pagado por estudiante:', montoPagadoNum);
        console.log('✅ Monto final a guardar:', montoFinal);
        
        // Si el monto pagado es diferente al original, guardarlo en observaciones
        if (Math.abs(montoPagadoNum - montoOriginal) > 0.01) {
          observacionesFinal = `Monto original de cuota: $${montoOriginal.toFixed(2)} | Monto pagado: $${montoPagadoNum.toFixed(2)}${observacionesFinal ? '\n' + observacionesFinal : ''}`;
          console.log('📝 Observaciones:', observacionesFinal);
        }
      } else {
        console.log('⚠️ No se recibió monto_pagado, usando monto original');
      }

      let sql = `
        UPDATE pagos_mensuales 
        SET metodo_pago = ?, 
            monto = ?,
            numero_comprobante = ?, 
            banco_comprobante = ?, 
            fecha_transferencia = ?, 
            observaciones = ?, 
            estado = 'pagado',
            fecha_pago = NOW()
      `;
      
      let params = [
        pagoData.metodo_pago,
        montoFinal,
        pagoData.numero_comprobante,
        pagoData.banco_comprobante,
        pagoData.fecha_transferencia,
        observacionesFinal
      ];

      // Agregar datos del archivo si existe
      if (archivoData) {
        sql += `, comprobante_pago_blob = ?, 
                 comprobante_mime = ?, 
                 comprobante_size_kb = ?, 
                 comprobante_nombre_original = ?`;
        params.push(
          archivoData.comprobanteBuffer,
          archivoData.comprobanteMime,
          archivoData.comprobanteSizeKb,
          archivoData.comprobanteNombreOriginal
        );
      }

      sql += ' WHERE id_pago = ?';
      params.push(id_pago);

      const [result] = await pool.execute(sql, params);
      
      if (result.affectedRows === 0) {
        throw new Error('No se pudo actualizar el pago');
      }

      // Obtener el pago actualizado
      const [pago] = await pool.execute(`
        SELECT pm.*, m.codigo_matricula, c.nombre as curso_nombre
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        INNER JOIN cursos c ON m.id_curso = c.id_curso
        WHERE pm.id_pago = ?
      `, [id_pago]);

      return pago[0];
    } catch (error) {
      console.error('Error registrando pago:', error);
      throw error;
    }
  }
}

module.exports = PagosMenualesModel;
