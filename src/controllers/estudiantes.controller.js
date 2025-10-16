const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const EstudiantesModel = require('../models/estudiantes.model');
const { enviarEmailBienvenidaEstudiante } = require('../services/emailService');
const { generarComprobantePagoMensual } = require('../services/pdfService');
const { registrarAuditoria } = require('../utils/auditoria');

// Función para generar username único
async function generateUniqueUsername(nombre, apellido) {
  try {
    // Extraer iniciales del nombre (todas las palabras)
    const nombreParts = nombre.trim().split(' ').filter(part => part.length > 0);
    const inicialesNombre = nombreParts.map(part => part.charAt(0).toLowerCase()).join('');
    
    // Extraer primer apellido
    const apellidoParts = apellido.trim().split(' ').filter(part => part.length > 0);
    const primerApellido = apellidoParts[0]?.toLowerCase() || '';
    
    // Crear username base
    const baseUsername = inicialesNombre + primerApellido;
    
    // Verificar si el username ya existe (en columna usuarios.username)
    const [existingUsers] = await pool.execute(
      'SELECT COUNT(*) as count FROM usuarios WHERE username = ?',
      [baseUsername]
    );
    
    if (existingUsers[0].count === 0) {
      return baseUsername;
    }
    
    // Si existe, buscar el siguiente número disponible (usernameX)
    let counter = 2;
    while (counter <= 99) {
      const numberedUsername = baseUsername + counter;
      const [checkUsers] = await pool.execute(
        'SELECT COUNT(*) as count FROM usuarios WHERE username = ?',
        [numberedUsername]
      );
      
      if (checkUsers[0].count === 0) {
        return numberedUsername;
      }
      counter++;
    }
    
    // Fallback si no se puede generar
    return baseUsername + Math.floor(Math.random() * 1000);
  } catch (error) {
    console.error('Error generando username:', error);
    // Fallback en caso de error
    const inicialesNombre = nombre.charAt(0).toLowerCase();
    const primerApellido = apellido.split(' ')[0]?.toLowerCase() || '';
    return inicialesNombre + primerApellido + Math.floor(Math.random() * 100);
  }
}

exports.createEstudianteFromSolicitud = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id_solicitud, aprobado_por } = req.body;
    
    if (!id_solicitud || !aprobado_por) {
      return res.status(400).json({ 
        error: 'Se requiere id_solicitud y aprobado_por' 
      });
    }
    
    // 1. Obtener datos de la solicitud
    const [solicitudes] = await connection.execute(`
      SELECT 
        s.*,
        tc.nombre AS tipo_curso_nombre
      FROM solicitudes_matricula s
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = s.id_tipo_curso
      WHERE s.id_solicitud = ? AND s.estado = 'pendiente'
    `, [id_solicitud]);
    
    if (solicitudes.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        error: 'Solicitud no encontrada o ya procesada' 
      });
    }
    
    const solicitud = solicitudes[0];
    
    // 2. Verificar si es estudiante existente o nuevo
    let id_estudiante;
    let username = null;
    let passwordTemporal = null;
    let esEstudianteExistente = false;
    
    if (solicitud.id_estudiante_existente) {
      // CASO 1: Estudiante YA existe en el sistema (inscripción a nuevo curso)
      console.log('✅ Estudiante existente detectado, ID:', solicitud.id_estudiante_existente);
      id_estudiante = solicitud.id_estudiante_existente;
      esEstudianteExistente = true;
      
      // Verificar que el estudiante existe y está activo
      const [estudianteCheck] = await connection.execute(`
        SELECT u.id_usuario, u.username, u.estado
        FROM usuarios u
        INNER JOIN roles r ON u.id_rol = r.id_rol
        WHERE u.id_usuario = ? AND r.nombre_rol = 'estudiante'
      `, [id_estudiante]);
      
      if (estudianteCheck.length === 0) {
        await connection.rollback();
        return res.status(400).json({ 
          error: 'Estudiante no encontrado o no válido' 
        });
      }
      
      if (estudianteCheck[0].estado !== 'activo') {
        await connection.rollback();
        return res.status(400).json({ 
          error: 'El estudiante no está activo en el sistema' 
        });
      }
      
      username = estudianteCheck[0].username;
      
    } else {
      // CASO 2: Estudiante NUEVO (flujo original)
      
      // Verificar que no exista ya un usuario con esa cédula
      const [existingUser] = await connection.execute(
        'SELECT id_usuario FROM usuarios WHERE cedula = ?',
        [solicitud.identificacion_solicitante]
      );
      
      if (existingUser.length > 0) {
        await connection.rollback();
        return res.status(400).json({ 
          error: 'Ya existe un usuario con esa cédula' 
        });
      }
    }
    
    // 3. Solo crear usuario si es estudiante NUEVO
    if (!esEstudianteExistente) {
      // Obtener el rol de estudiante
      const [roles] = await connection.execute(
        'SELECT id_rol FROM roles WHERE nombre_rol = ?',
        ['estudiante']
      );
      
      let id_rol_estudiante;
      if (roles.length === 0) {
        // Crear rol estudiante si no existe
        const [roleResult] = await connection.execute(
          'INSERT INTO roles (nombre_rol, descripcion, estado) VALUES (?, ?, ?)',
          ['estudiante', 'Estudiante del sistema', 'activo']
        );
        id_rol_estudiante = roleResult.insertId;
      } else {
        id_rol_estudiante = roles[0].id_rol;
      }
      
      // 4. Generar username único
      username = await generateUniqueUsername(
        solicitud.nombre_solicitante, 
        solicitud.apellido_solicitante
      );
      
      // 5. Guardar email personal del solicitante
      const emailEstudiante = solicitud.email_solicitante || null;
      
      // 6. Generar contraseña temporal (documento) con bcrypt
      passwordTemporal = solicitud.identificacion_solicitante;
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(passwordTemporal, salt);
      
      // 7. Crear usuario estudiante
      const [userResult] = await connection.execute(`
        INSERT INTO usuarios (
          cedula, nombre, apellido, fecha_nacimiento, telefono, email, username,
          direccion, genero, password, password_temporal, id_rol, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        solicitud.identificacion_solicitante,
        solicitud.nombre_solicitante,
        solicitud.apellido_solicitante,
        solicitud.fecha_nacimiento_solicitante,
        solicitud.telefono_solicitante,
        emailEstudiante,
        username,
        solicitud.direccion_solicitante,
        solicitud.genero_solicitante,
        hashedPassword,
        passwordTemporal,
        id_rol_estudiante,
        'activo'
      ]);
      
      id_estudiante = userResult.insertId;
      console.log('✅ Nuevo estudiante creado, ID:', id_estudiante);
    }
    
    // 8. Crear matrícula automáticamente
    const codigoMatricula = `MAT-${Date.now()}-${id_estudiante}`;
    
    // Obtener el curso asociado al tipo de curso de la solicitud
    const [cursosDisponibles] = await connection.execute(`
      SELECT id_curso FROM cursos 
      WHERE id_tipo_curso = ? AND estado IN ('activo', 'planificado')
      ORDER BY fecha_inicio ASC LIMIT 1
    `, [solicitud.id_tipo_curso]);
    
    let id_curso = null;
    if (cursosDisponibles.length > 0) {
      id_curso = cursosDisponibles[0].id_curso;
    } else {
      // Si no hay curso específico, crear uno temporal o usar un valor por defecto
      console.warn('⚠️ No se encontró curso para el tipo:', solicitud.id_tipo_curso);
      // Por ahora, continuamos sin curso específico
    }
    
    if (id_curso) {
      // Obtener email del estudiante (existente o nuevo)
      let emailParaMatricula;
      if (esEstudianteExistente) {
        const [estudianteData] = await connection.execute(
          'SELECT email FROM usuarios WHERE id_usuario = ?',
          [id_estudiante]
        );
        emailParaMatricula = estudianteData[0]?.email || `${username}@estudiante.belleza.com`;
      } else {
        const emailEstudiante = solicitud.email_solicitante || null;
        emailParaMatricula = emailEstudiante || `${username}@estudiante.belleza.com`;
      }
      
      const [matriculaResult] = await connection.execute(`
        INSERT INTO matriculas (
          codigo_matricula, id_solicitud, id_tipo_curso, id_estudiante, 
          id_curso, monto_matricula, email_generado, creado_por, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activa')
      `, [
        codigoMatricula,
        id_solicitud,
        solicitud.id_tipo_curso,
        id_estudiante,
        id_curso,
        solicitud.monto_matricula || 0,
        emailParaMatricula,
        aprobado_por
      ]);
      
      const id_matricula = matriculaResult.insertId;
      console.log('✅ Matrícula creada:', codigoMatricula, 'ID:', id_matricula);

      // *** INSERTAR EN ESTUDIANTE_CURSO PARA REPORTES ***
      await connection.execute(`
        INSERT INTO estudiante_curso (id_estudiante, id_curso, fecha_inscripcion, estado)
        VALUES (?, ?, NOW(), 'activo')
      `, [id_estudiante, id_curso]);
      console.log('✅ Estudiante agregado a estudiante_curso para reportes');

      // *** GENERAR CUOTAS AUTOMÁTICAMENTE (MENSUAL O POR CLASES) ***
      console.log('🔍 Generando cuotas para matrícula:', id_matricula);
      
      // Obtener información completa del tipo de curso
      const [tipoCurso] = await connection.execute(`
        SELECT 
          duracion_meses, 
          precio_base,
          modalidad_pago,
          numero_clases,
          precio_por_clase,
          matricula_incluye_primera_clase
        FROM tipos_cursos 
        WHERE id_tipo_curso = ?
      `, [solicitud.id_tipo_curso]);

      console.log('🔍 Tipo de curso encontrado:', tipoCurso);

      if (tipoCurso.length > 0) {
        const tipoCursoData = tipoCurso[0];
        const modalidadPago = tipoCursoData.modalidad_pago || 'mensual';
        
        console.log('🔍 Debug - Modalidad de pago:', modalidadPago);
        
        if (modalidadPago === 'clases') {
          // ========================================
          // MODALIDAD POR CLASES
          // ========================================
          const numeroClases = tipoCursoData.numero_clases;
          const precioPorClase = parseFloat(tipoCursoData.precio_por_clase);
          
          console.log('🔍 Debug - Generando cuotas por CLASES:', {
            numeroClases,
            precioPorClase,
            id_matricula
          });
          
          // Generar cuotas por clases
          const fechaInicio = new Date();
          
          for (let i = 1; i <= numeroClases; i++) {
            // Fecha de vencimiento: cada 7 días (clases semanales)
            const fechaVencimiento = new Date(fechaInicio);
            fechaVencimiento.setDate(fechaInicio.getDate() + (i - 1) * 7);
            
            // Monto: primera clase = $50 (matrícula), resto = precio por clase
            const montoCuota = i === 1 ? 50.00 : precioPorClase;
            
            console.log(`🔍 Creando cuota clase ${i}:`, {
              id_matricula,
              numero_cuota: i,
              monto: montoCuota,
              fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0]
            });
            
            if (i === 1) {
              // Primera clase VERIFICADA (matrícula pagada)
              await connection.execute(`
                INSERT INTO pagos_mensuales (
                  id_matricula, numero_cuota, monto, fecha_vencimiento, 
                  fecha_pago, metodo_pago, numero_comprobante, banco_comprobante, 
                  fecha_transferencia, recibido_por, comprobante_pago_blob, 
                  comprobante_mime, comprobante_size_kb, comprobante_nombre_original,
                  verificado_por, fecha_verificacion, estado, observaciones
                ) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'verificado', ?)
              `, [
                id_matricula, i, montoCuota, fechaVencimiento.toISOString().split('T')[0],
                solicitud.metodo_pago, solicitud.numero_comprobante, solicitud.banco_comprobante,
                solicitud.fecha_transferencia, solicitud.recibido_por, solicitud.comprobante_pago,
                solicitud.comprobante_mime, solicitud.comprobante_size_kb, solicitud.comprobante_nombre_original,
                aprobado_por, `Matrícula pagada - Clase ${i} de ${numeroClases}`
              ]);
              console.log(`✅ Cuota clase #${i} creada con estado VERIFICADO`);
            } else {
              // Demás clases en pendiente
              await connection.execute(`
                INSERT INTO pagos_mensuales (
                  id_matricula, numero_cuota, monto, fecha_vencimiento, estado, metodo_pago, observaciones
                ) VALUES (?, ?, ?, ?, 'pendiente', 'transferencia', ?)
              `, [
                id_matricula, i, montoCuota, fechaVencimiento.toISOString().split('T')[0],
                `Clase ${i} de ${numeroClases} - Pago individual por clase`
              ]);
              console.log(`✅ Cuota clase #${i} creada con estado PENDIENTE`);
            }
          }
          
          console.log(`✅ ${numeroClases} clases generadas exitosamente para matrícula: ${id_matricula}`);
          
        } else {
          // ========================================
          // MODALIDAD MENSUAL (LÓGICA ORIGINAL)
          // ========================================
          const duracionMeses = tipoCursoData.duracion_meses;
          const precioMensual = tipoCursoData.precio_base / duracionMeses;
          
          console.log('🔍 Debug - Generando cuotas MENSUALES:', {
            duracionMeses,
            precioMensual,
            id_matricula
          });
          
          const fechaAprobacion = new Date();
          const diaAprobacion = fechaAprobacion.getDate();
          
          for (let i = 1; i <= duracionMeses; i++) {
            const fechaVencimiento = new Date(fechaAprobacion);
            
            if (i === 1) {
              fechaVencimiento.setDate(diaAprobacion);
            } else {
              fechaVencimiento.setMonth(fechaAprobacion.getMonth() + (i - 1));
              fechaVencimiento.setDate(diaAprobacion);
            }
            
            if (i === 1) {
              await connection.execute(`
                INSERT INTO pagos_mensuales (
                  id_matricula, numero_cuota, monto, fecha_vencimiento, 
                  fecha_pago, metodo_pago, numero_comprobante, banco_comprobante,
                  fecha_transferencia, recibido_por, comprobante_pago_blob,
                  comprobante_mime, comprobante_size_kb, comprobante_nombre_original,
                  verificado_por, fecha_verificacion, estado
                ) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'verificado')
              `, [
                id_matricula, i, solicitud.monto_matricula || precioMensual,
                fechaVencimiento.toISOString().split('T')[0],
                solicitud.metodo_pago, solicitud.numero_comprobante, solicitud.banco_comprobante,
                solicitud.fecha_transferencia, solicitud.recibido_por, solicitud.comprobante_pago,
                solicitud.comprobante_mime, solicitud.comprobante_size_kb, solicitud.comprobante_nombre_original,
                aprobado_por
              ]);
            } else {
              await connection.execute(`
                INSERT INTO pagos_mensuales (
                  id_matricula, numero_cuota, monto, fecha_vencimiento, estado, metodo_pago
                ) VALUES (?, ?, ?, ?, 'pendiente', 'transferencia')
              `, [id_matricula, i, precioMensual, fechaVencimiento.toISOString().split('T')[0]]);
            }
          }
          
          console.log('✅ Cuotas mensuales generadas exitosamente para matrícula:', id_matricula);
        }
      } else {
        console.log('❌ No se encontró tipo de curso para generar cuotas');
      }
    }
    
    // 9. Actualizar estado de la solicitud
    await connection.execute(`
      UPDATE solicitudes_matricula 
      SET estado = 'aprobado', 
          verificado_por = ?, 
          fecha_verificacion = NOW()
      WHERE id_solicitud = ?
    `, [aprobado_por, id_solicitud]);
    
    await connection.commit();
    
    // Registrar auditoría - Creación de estudiante (solo si es nuevo)
    if (!esEstudianteExistente) {
      await registrarAuditoria(
        'usuarios',
        'INSERT',
        id_estudiante,
        aprobado_por,
        null,
        {
          cedula: solicitud.identificacion_solicitante,
          nombre: solicitud.nombre_solicitante,
          apellido: solicitud.apellido_solicitante,
          username: username,
          rol: 'estudiante',
          desde_solicitud: id_solicitud
        },
        req
      );
    }
    
    // Registrar auditoría - Aprobación de solicitud
    await registrarAuditoria(
      'solicitudes_matricula',
      'UPDATE',
      id_solicitud,
      aprobado_por,
      { estado: 'pendiente' },
      { estado: 'aprobado', verificado_por: aprobado_por },
      req
    );
    
    // 10. ENVIAR EMAIL DE BIENVENIDA CON CREDENCIALES Y PDF DEL PRIMER PAGO (solo para estudiantes nuevos, asíncrono)
    if (!esEstudianteExistente && passwordTemporal) {
      setImmediate(async () => {
        try {
          const datosEstudiante = {
            nombres: solicitud.nombre_solicitante,
            apellidos: solicitud.apellido_solicitante,
            cedula: solicitud.identificacion_solicitante,
            email: solicitud.email_solicitante
          };

          const credenciales = {
            username: username,
            password: passwordTemporal
          };

          // Generar PDF del comprobante del primer pago
          let pdfComprobante = null;
          try {
            // Obtener datos del primer pago (cuota #1 que se creó automáticamente como VERIFICADA)
            const [primerPago] = await pool.execute(`
              SELECT 
                pm.id_pago as id_pago_mensual,
                pm.monto,
                pm.fecha_pago,
                pm.metodo_pago,
                pm.numero_cuota,
                pm.numero_comprobante,
                pm.banco_comprobante,
                pm.fecha_transferencia,
                DATE_FORMAT(pm.fecha_pago, '%Y-%m') as mes_pago,
                c.nombre as nombre_curso
              FROM pagos_mensuales pm
              INNER JOIN matriculas m ON pm.id_matricula = m.id_matricula
              INNER JOIN cursos c ON m.id_curso = c.id_curso
              WHERE m.id_estudiante = ? 
                AND pm.numero_cuota = 1
                AND pm.estado = 'verificado'
              ORDER BY pm.fecha_pago DESC
              LIMIT 1
            `, [id_estudiante]);

            if (primerPago.length > 0) {
              const datosPago = primerPago[0];
              const datosCurso = {
                nombre_curso: datosPago.nombre_curso
              };

              // Generar PDF del comprobante
              pdfComprobante = await generarComprobantePagoMensual(datosEstudiante, datosPago, datosCurso);
              console.log('✅ PDF del comprobante del primer pago generado');
              console.log('📄 Datos del PDF:', {
                estudiante: `${datosEstudiante.nombres} ${datosEstudiante.apellidos}`,
                monto: datosPago.monto,
                cuota: datosPago.numero_cuota,
                comprobante: datosPago.numero_comprobante
              });
            } else {
              console.log('⚠️ No se encontró el primer pago para generar PDF');
            }
          } catch (pdfError) {
            console.error('❌ Error generando PDF del comprobante (continuando sin PDF):', pdfError);
          }

          // Enviar email de bienvenida con credenciales y PDF del primer pago
          await enviarEmailBienvenidaEstudiante(datosEstudiante, credenciales, pdfComprobante);
          console.log('✅ Email de bienvenida enviado a:', solicitud.email_solicitante);
          if (pdfComprobante) {
            console.log('✅ PDF del primer pago incluido en el email');
          }
          
        } catch (emailError) {
          console.error('❌ Error enviando email de bienvenida (no afecta la creación):', emailError);
        }
      });
    }
    
    // Respuesta diferente según si es nuevo o existente
    if (esEstudianteExistente) {
      res.json({
        success: true,
        message: 'Nueva matrícula creada para estudiante existente',
        tipo: 'estudiante_existente',
        estudiante: {
          id_usuario: id_estudiante,
          identificacion: solicitud.identificacion_solicitante,
          username: username
        }
      });
    } else {
      res.json({
        success: true,
        message: 'Estudiante creado exitosamente',
        tipo: 'estudiante_nuevo',
        estudiante: {
          id_usuario: id_estudiante,
          identificacion: solicitud.identificacion_solicitante,
          nombre: solicitud.nombre_solicitante,
          apellido: solicitud.apellido_solicitante,
          email: solicitud.email_solicitante,
          username: username,
          password_temporal: passwordTemporal
        }
      });
    }
    
  } catch (error) {
    await connection.rollback();
    console.error('Error creando estudiante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  } finally {
    connection.release();
  }
};

exports.getEstudiantes = async (req, res) => {
  try {
    const filters = {
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      search: req.query.search || ''
    };
    
    const result = await EstudiantesModel.getAll(filters);
    const { estudiantes, total } = result;
    
    res.setHeader('X-Total-Count', String(total));
    res.json(estudiantes);
    
  } catch (error) {
    console.error('Error obteniendo estudiantes:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

exports.getMisCursos = async (req, res) => {
  try {
    const id_usuario = req.user?.id_usuario;
    
    if (!id_usuario) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar que el usuario sea estudiante
    const isEstudiante = await EstudiantesModel.isEstudiante(id_usuario);
    
    if (!isEstudiante) {
      return res.status(403).json({ error: 'Acceso denegado. Solo estudiantes pueden acceder a esta información.' });
    }

    // Obtener cursos matriculados usando el modelo (incluye docente, aula y horario)
    const cursos = await EstudiantesModel.getMisCursos(id_usuario);

    res.json(cursos);
    
  } catch (error) {
    console.error('Error obteniendo cursos del estudiante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

exports.getEstudianteById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    
    const [estudiantes] = await pool.execute(`
      SELECT 
        u.id_usuario,
        u.cedula as identificacion,
        u.nombre,
        u.apellido,
        u.username,
        u.email,
        u.telefono,
        u.fecha_nacimiento,
        u.genero,
        u.direccion,
        u.estado,
        u.fecha_registro,
        u.fecha_ultima_conexion
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante' AND u.id_usuario = ?
    `, [id]);
    
    if (estudiantes.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    
    res.json(estudiantes[0]);
    
  } catch (error) {
    console.error('Error obteniendo estudiante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

exports.updateEstudiante = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    
    const {
      nombre,
      apellido,
      telefono,
      fecha_nacimiento,
      genero,
      direccion,
      estado
    } = req.body;
    
    // Verificar que el estudiante existe
    const [existing] = await pool.execute(`
      SELECT u.id_usuario 
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante' AND u.id_usuario = ?
    `, [id]);
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    
    await pool.execute(`
      UPDATE usuarios 
      SET nombre = ?, apellido = ?, telefono = ?, 
          fecha_nacimiento = ?, genero = ?, direccion = ?, estado = ?
      WHERE id_usuario = ?
    `, [nombre, apellido, telefono, fecha_nacimiento, genero, direccion, estado, id]);
    
    res.json({ success: true, message: 'Estudiante actualizado exitosamente' });
    
  } catch (error) {
    console.error('Error actualizando estudiante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

exports.getEstudiantesRecientes = async (req, res) => {
  try {
    const [estudiantes] = await pool.execute(`
      SELECT 
        u.id_usuario,
        u.username,
        u.cedula,
        u.nombre,
        u.apellido,
        u.password_temporal,
        u.fecha_registro,
        r.nombre_rol
      FROM usuarios u
      JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante'
      ORDER BY u.fecha_registro DESC
      LIMIT 3
    `);
    
    res.json({
      message: 'Estudiantes recientes (últimos 3)',
      estudiantes: estudiantes.map(est => ({
        id_usuario: est.id_usuario,
        username: est.username,
        cedula: est.cedula,
        nombre: `${est.nombre} ${est.apellido}`,
        password_temporal: est.password_temporal,
        fecha_registro: est.fecha_registro,
        login_info: {
          username: est.username,
          password: est.password_temporal || est.cedula
        }
      }))
    });
    
  } catch (error) {
    console.error('Error obteniendo estudiantes recientes:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Obtener pagos mensuales del estudiante autenticado
exports.getMisPagosMenuales = async (req, res) => {
  try {
    const id_estudiante = req.user?.id_usuario;

    if (!id_estudiante) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar que el usuario sea estudiante
    const [userCheck] = await pool.execute(`
      SELECT u.id_usuario, r.nombre_rol 
      FROM usuarios u 
      JOIN roles r ON u.id_rol = r.id_rol 
      WHERE u.id_usuario = ?
    `, [id_estudiante]);
    
    if (userCheck.length === 0 || userCheck[0].nombre_rol !== 'estudiante') {
      return res.status(403).json({ error: 'Acceso denegado. Solo estudiantes pueden acceder a esta información.' });
    }

    // Obtener pagos mensuales del estudiante
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
        pm.metodo_pago,
        pm.estado,
        pm.observaciones,
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

    res.json(pagos);

  } catch (error) {
    console.error('Error obteniendo pagos mensuales del estudiante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};

// Verificar si estudiante existe por cédula/pasaporte
exports.verificarEstudiante = async (req, res) => {
  try {
    const { identificacion } = req.query;
    
    if (!identificacion || !identificacion.trim()) {
      return res.status(400).json({ error: 'Identificación es requerida' });
    }

    // Buscar estudiante por cédula en tabla usuarios con rol estudiante
    const [usuarios] = await pool.execute(`
      SELECT 
        u.id_usuario,
        u.cedula as identificacion,
        u.nombre,
        u.apellido,
        u.email,
        u.telefono,
        u.fecha_nacimiento,
        u.genero,
        u.direccion,
        u.estado,
        r.nombre_rol
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante' 
        AND u.cedula = ?
        AND u.estado = 'activo'
    `, [identificacion.trim().toUpperCase()]);

    if (usuarios.length === 0) {
      return res.json({ 
        existe: false,
        mensaje: 'Estudiante no encontrado en el sistema'
      });
    }

    const estudiante = usuarios[0];

    // Obtener cursos matriculados
    const [cursos] = await pool.execute(`
      SELECT 
        c.nombre as curso_nombre,
        tc.nombre as tipo_curso_nombre,
        m.estado as estado_matricula,
        m.fecha_matricula
      FROM matriculas m
      INNER JOIN cursos c ON m.id_curso = c.id_curso
      INNER JOIN tipos_cursos tc ON c.id_tipo_curso = tc.id_tipo_curso
      WHERE m.id_estudiante = ?
      ORDER BY m.fecha_matricula DESC
    `, [estudiante.id_usuario]);

    return res.json({
      existe: true,
      estudiante: {
        id_usuario: estudiante.id_usuario,
        identificacion: estudiante.identificacion,
        nombre: estudiante.nombre,
        apellido: estudiante.apellido,
        email: estudiante.email,
        telefono: estudiante.telefono,
        fecha_nacimiento: estudiante.fecha_nacimiento,
        genero: estudiante.genero,
        direccion: estudiante.direccion
      },
      cursos_matriculados: cursos,
      mensaje: 'Estudiante encontrado en el sistema'
    });

  } catch (error) {
    console.error('Error verificando estudiante:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
};
