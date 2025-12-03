const { pool } = require('../config/database');
const { enviarComprobantePagoMensual } = require('../services/emailService');
const { generarComprobantePagoMensual } = require('../services/pdfService');
const { emitSocketEvent, emitToUser } = require('../services/socket.service');
const { notificarPagoVerificado } = require('../utils/notificationHelper');
const { registrarAuditoria } = require('../utils/auditoria');

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
        pm.comprobante_pago_url,
        pm.comprobante_pago_public_id,
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
        c.horario as curso_horario,
        m.codigo_matricula,
        tc.modalidad_pago,
        tc.numero_clases,
        tc.precio_por_clase,
        verificador.nombre as verificado_por_nombre,
        verificador.apellido as verificado_por_apellido
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      LEFT JOIN usuarios verificador ON pm.verificado_por = verificador.id_usuario
      WHERE m.estado = 'activa' AND c.estado = 'activo'
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
    const limitNum = parseInt(limit) || 999999;
    const offsetNum = parseInt(offset) || 0;

    sql += ` ORDER BY pm.fecha_vencimiento DESC, pm.id_pago DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

    const [pagos] = await pool.execute(sql, params);

    console.log('Pagos obtenidos:', pagos.length);
    if (pagos.length > 0) {
      console.log('Primer pago:', {
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

    console.log('Verificando usuario:', verificado_por);
    console.log('Usuario encontrado:', usuario);

    if (usuario.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const rolPermitido = usuario[0].nombre_rol.toLowerCase();
    console.log('Rol del usuario:', rolPermitido);

    if (rolPermitido !== 'admin' && rolPermitido !== 'administrativo') {
      console.log('Rol no permitido:', rolPermitido);
      return res.status(403).json({
        error: `Solo los administradores pueden verificar pagos. Rol actual: ${rolPermitido}`
      });
    }

    console.log('Rol permitido, continuando con verificación...');

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

    console.log(`Pago ${id} verificado por usuario ${verificado_por}`);

    // Obtener información del pago y estudiante para notificaciones
    const [estudianteInfo] = await pool.execute(`
      SELECT 
        m.id_estudiante,
        pm.numero_cuota,
        pm.monto,
        pm.fecha_vencimiento,
        pm.metodo_pago,
        c.nombre as curso_nombre,
        u.nombre as estudiante_nombre,
        u.apellido as estudiante_apellido,
        u.cedula as estudiante_cedula
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
      WHERE pm.id_pago = ?
    `, [id]);

    const id_estudiante = estudianteInfo[0]?.id_estudiante;
    console.log(`ID Estudiante obtenido: ${id_estudiante}`);

    // Registrar auditoría de verificación de pago
    await registrarAuditoria({
      tabla_afectada: 'pagos_mensuales',
      operacion: 'UPDATE',
      id_registro: parseInt(id),
      usuario_id: verificado_por,
      datos_anteriores: { estado: 'pagado' },
      datos_nuevos: {
        estado: 'verificado',
        id_pago: parseInt(id),
        numero_cuota: estudianteInfo[0]?.numero_cuota,
        monto: estudianteInfo[0]?.monto,
        metodo_pago: estudianteInfo[0]?.metodo_pago,
        nombre_curso: estudianteInfo[0]?.curso_nombre,
        estudiante_nombre: estudianteInfo[0]?.estudiante_nombre,
        estudiante_apellido: estudianteInfo[0]?.estudiante_apellido,
        estudiante_cedula: estudianteInfo[0]?.estudiante_cedula
      },
      ip_address: req.ip || '0.0.0.0',
      user_agent: req.get('user-agent') || 'unknown'
    });

    // VERIFICAR SI EL ESTUDIANTE DEBE SER DESBLOQUEADO PERMANENTEMENTE
    // Esto ocurre cuando:
    // 1. El estudiante tiene desbloqueo temporal activo
    // 2. Ya no tiene cuotas vencidas pendientes
    try {
      const [estudianteData] = await pool.execute(`
        SELECT 
          desbloqueo_temporal,
          cuenta_bloqueada
        FROM usuarios
        WHERE id_usuario = ?
      `, [id_estudiante]);

      if (estudianteData[0]?.desbloqueo_temporal) {
        console.log(`Estudiante ${id_estudiante} tiene desbloqueo temporal activo, verificando cuotas pendientes...`);

        // Contar cuotas vencidas pendientes
        const [cuotasVencidas] = await pool.execute(`
          SELECT COUNT(*) as total
          FROM pagos_mensuales pm
          INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
          WHERE m.id_estudiante = ?
            AND pm.estado = 'pendiente'
            AND pm.fecha_vencimiento < CURDATE()
        `, [id_estudiante]);

        const totalVencidas = cuotasVencidas[0].total;
        console.log(`Cuotas vencidas restantes: ${totalVencidas}`);

        if (totalVencidas === 0) {
          // Ya no tiene cuotas vencidas, hacer desbloqueo permanente
          console.log(`Haciendo desbloqueo permanente para estudiante ${id_estudiante}...`);

          const TemporaryUnblockService = require('../services/temporary-unblock.service');
          await TemporaryUnblockService.makePermanentUnblock(id_estudiante);

          console.log(`Desbloqueo permanente completado para estudiante ${id_estudiante}`);
        } else {
          console.log(`Estudiante aún tiene ${totalVencidas} cuota(s) vencida(s), desbloqueo temporal continúa`);
        }
      }
    } catch (unlockError) {
      console.error('Error verificando desbloqueo permanente:', unlockError);
      // No lanzar error, la verificación del pago ya se completó
    }

    // ENVIAR EMAIL CON PDF DEL COMPROBANTE AL ESTUDIANTE (asíncrono)
    // IMPORTANTE: NO enviar email para cuota #1 (ya se envió con email de bienvenida)
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

        console.log('Datos del pago obtenidos:', pagoCompleto);

        if (pagoCompleto.length > 0) {
          const pago = pagoCompleto[0];

          // NO ENVIAR EMAIL PARA CUOTA #1 (ya se envió con el email de bienvenida)
          if (pago.numero_cuota === 1) {
            console.log('Cuota #1 detectada - Email ya enviado con bienvenida, omitiendo envío duplicado');
            return;
          }

          console.log('Enviando email a:', pago.estudiante_email);

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

            console.log('Clases pagadas encontradas:', clasesPagadas);
          }

          console.log('Generando PDF del comprobante...');
          // Generar PDF del comprobante
          const pdfBuffer = await generarComprobantePagoMensual(datosEstudiante, datosPago, datosCurso, clasesPagadas);

          console.log('Enviando email con PDF adjunto...');
          // Enviar email con PDF adjunto
          await enviarComprobantePagoMensual(datosEstudiante, datosPago, pdfBuffer);

          console.log('Email con comprobante PDF enviado a:', pago.estudiante_email);
        } else {
          console.log('No se encontró el pago con ID:', id);
        }
      } catch (emailError) {
        console.error('Error enviando email con comprobante (no afecta la verificación):', emailError);
      }
    });

    console.log(`Emitiendo evento pago_verificado a todos los admins...`);
    emitSocketEvent(req, 'pago_verificado', {
      id_pago: Number(id),
      numero_cuota: estudianteInfo[0]?.numero_cuota,
      monto: estudianteInfo[0]?.monto,
      curso_nombre: estudianteInfo[0]?.curso_nombre,
      estado: 'verificado',
      fecha_verificacion: new Date()
    });

    // Enviar notificación al estudiante
    if (id_estudiante && estudianteInfo[0]) {
      console.log(`Intentando enviar notificación al estudiante con id_estudiante: ${id_estudiante}`);

      // id_estudiante ya ES el id_usuario (es el mismo campo en la tabla matriculas)
      const id_usuario_estudiante = id_estudiante;

      console.log(`Enviando notificación de pago verificado al usuario ${id_usuario_estudiante}`);

      // Obtener información del admin que verificó
      const [adminInfo] = await pool.execute(`
        SELECT nombre, apellido 
        FROM usuarios 
        WHERE id_usuario = ?
      `, [verificado_por]);

      const nombreAdmin = adminInfo[0]
        ? `${adminInfo[0].nombre} ${adminInfo[0].apellido}`
        : 'Administrador';

      // Notificar al estudiante usando notificationHelper
      notificarPagoVerificado(req, id_usuario_estudiante, {
        id_pago: Number(id),
        numero_cuota: estudianteInfo[0].numero_cuota,
        monto: parseFloat(estudianteInfo[0].monto),
        curso_nombre: estudianteInfo[0].curso_nombre,
        admin_nombre: nombreAdmin
      });

      console.log(`Notificación enviada al estudiante ${id_usuario_estudiante}: Cuota #${estudianteInfo[0].numero_cuota} - $${estudianteInfo[0].monto} (${estudianteInfo[0].curso_nombre}) verificado por ${nombreAdmin}`);
    } else {
      console.log(`No se pudo obtener id_estudiante para el pago ${id}`);
    }

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

    console.log('Solicitando comprobante para pago ID:', id);

    const [pagos] = await pool.execute(`
      SELECT
        id_matricula,
        comprobante_pago_url,
        comprobante_pago_public_id
      FROM pagos_mensuales
      WHERE id_pago = ?
    `, [id]);

    console.log('Resultado de la consulta por ID:', {
      encontrado: pagos.length > 0,
      tieneUrl: pagos.length > 0 && !!pagos[0].comprobante_pago_url
    });

    if (pagos.length === 0) {
      console.log('Pago no encontrado');
      return res.status(404).json({
        success: false,
        error: 'Comprobante no encontrado'
      });
    }

    let pago = pagos[0];

    if (!pago.comprobante_pago_url && pago.id_matricula) {
      console.log('No hay comprobante en esta cuota, buscando en la misma matrícula...');
      const [pagosMismaMatricula] = await pool.execute(`
        SELECT
          comprobante_pago_url,
          comprobante_pago_public_id
        FROM pagos_mensuales
        WHERE id_matricula = ? AND comprobante_pago_url IS NOT NULL
        ORDER BY numero_cuota ASC, id_pago ASC
        LIMIT 1
      `, [pago.id_matricula]);

      if (pagosMismaMatricula.length === 0) {
        console.log('No se encontró ningún comprobante en la matrícula');
        return res.status(404).json({
          success: false,
          error: 'Comprobante no encontrado'
        });
      }

      pago = pagosMismaMatricula[0];
      console.log('Comprobante encontrado en otra cuota de la misma matrícula');
    }

    if (!pago.comprobante_pago_url) {
      return res.status(404).json({
        success: false,
        error: 'Comprobante no encontrado'
      });
    }

    console.log('Retornando URL de Cloudinary:', pago.comprobante_pago_url);

    // Retornar JSON con la URL de Cloudinary
    res.json({
      success: true,
      comprobante_pago_url: pago.comprobante_pago_url,
      comprobante_pago_public_id: pago.comprobante_pago_public_id
    });
  } catch (error) {
    console.error('Error descargando comprobante:', error);
    res.status(500).json({
      success: false,
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

    console.log(`Pago ${id} rechazado por usuario ${verificado_por}`);

    // Obtener más información del pago para el evento
    const [pagoInfo] = await pool.execute(`
      SELECT 
        pm.numero_cuota,
        pm.monto,
        m.id_estudiante,
        c.nombre as curso_nombre
      FROM pagos_mensuales pm
      INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      WHERE pm.id_pago = ?
    `, [id]);

    const id_estudiante = pagoInfo[0]?.id_estudiante;

    // Registrar auditoría - Admin rechazó pago
    try {
      const [pagoCompleto] = await pool.execute(`
        SELECT 
          pm.numero_cuota,
          pm.monto,
          pm.metodo_pago,
          pm.estado as estado_anterior,
          u.nombre as estudiante_nombre,
          u.apellido as estudiante_apellido,
          u.cedula as estudiante_cedula,
          c.nombre as curso_nombre,
          c.codigo_curso
        FROM pagos_mensuales pm
        INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
        INNER JOIN usuarios u ON m.id_estudiante = u.id_usuario
        INNER JOIN cursos c ON m.id_curso = c.id_curso
        WHERE pm.id_pago = ?
      `, [id]);

      if (pagoCompleto.length > 0) {
        const pago = pagoCompleto[0];
        await registrarAuditoria({
          tabla_afectada: 'pagos_mensuales',
          operacion: 'UPDATE',
          id_registro: parseInt(id),
          usuario_id: verificado_por,
          datos_anteriores: { estado: pago.estado_anterior || 'pagado' },
          datos_nuevos: {
            estado: 'pendiente',
            id_pago: parseInt(id),
            numero_cuota: pago.numero_cuota,
            monto: parseFloat(pago.monto),
            metodo_pago: pago.metodo_pago,
            curso_nombre: pago.curso_nombre,
            codigo_curso: pago.codigo_curso,
            estudiante_nombre: `${pago.estudiante_nombre} ${pago.estudiante_apellido}`,
            estudiante_cedula: pago.estudiante_cedula,
            observaciones: observaciones,
            accion: 'pago_rechazado'
          },
          ip_address: req.ip || req.connection?.remoteAddress || null,
          user_agent: req.get('user-agent') || null
        });
      }
    } catch (auditError) {
      console.error('Error registrando auditoría de rechazo de pago (no afecta el rechazo):', auditError);
    }

    console.log(`Emitiendo evento pago_rechazado a todos los admins...`);
    emitSocketEvent(req, 'pago_rechazado', {
      id_pago: Number(id),
      numero_cuota: pagoInfo[0]?.numero_cuota,
      monto: pagoInfo[0]?.monto,
      curso_nombre: pagoInfo[0]?.curso_nombre,
      estado: 'pendiente',
      observaciones: observaciones,
      fecha_verificacion: new Date()
    });

    if (id_estudiante) {
      emitToUser(req, id_estudiante, 'pago_rechazado', {
        id_pago: Number(id),
        numero_cuota: pagoInfo[0]?.numero_cuota,
        monto: pagoInfo[0]?.monto,
        curso_nombre: pagoInfo[0]?.curso_nombre,
        estado: 'pendiente',
        observaciones: observaciones,
        fecha_verificacion: new Date()
      });
    }

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
