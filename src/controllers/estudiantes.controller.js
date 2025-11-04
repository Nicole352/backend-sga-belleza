const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const EstudiantesModel = require('../models/estudiantes.model');
const { enviarEmailBienvenidaEstudiante } = require('../services/emailService');
const { generarComprobantePagoMensual } = require('../services/pdfService');
const { registrarAuditoria } = require('../utils/auditoria');
const ExcelJS = require('exceljs');

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
    
    // Obtener el curso asociado al tipo de curso de la solicitud CON EL HORARIO CORRECTO
    console.log('🔍 Buscando curso con horario:', solicitud.horario_preferido);
    const [cursosDisponibles] = await connection.execute(`
      SELECT 
        c.id_curso, 
        c.horario,
        c.capacidad_maxima,
        COALESCE(
          (SELECT COUNT(*) FROM matriculas m WHERE m.id_curso = c.id_curso AND m.estado = 'activa'), 0
        ) + COALESCE(
          (SELECT COUNT(*) FROM solicitudes_matricula s 
           WHERE s.id_curso = c.id_curso 
           AND s.estado = 'pendiente'
           AND s.id_solicitud != ?), 0
        ) AS cupos_ocupados,
        c.capacidad_maxima - (
          COALESCE(
            (SELECT COUNT(*) FROM matriculas m WHERE m.id_curso = c.id_curso AND m.estado = 'activa'), 0
          ) + COALESCE(
            (SELECT COUNT(*) FROM solicitudes_matricula s 
             WHERE s.id_curso = c.id_curso 
             AND s.estado = 'pendiente'
             AND s.id_solicitud != ?), 0
          )
        ) AS cupos_reales_disponibles
      FROM cursos c
      WHERE c.id_tipo_curso = ? 
        AND c.horario = ?
        AND c.estado IN ('activo', 'planificado')
      HAVING cupos_reales_disponibles > 0
      ORDER BY c.fecha_inicio ASC 
      LIMIT 1
    `, [id_solicitud, id_solicitud, solicitud.id_tipo_curso, solicitud.horario_preferido]);
    
    let id_curso = null;
    if (cursosDisponibles.length > 0) {
      id_curso = cursosDisponibles[0].id_curso;
      console.log('✅ Curso encontrado:', id_curso, 'Horario:', cursosDisponibles[0].horario, 'Cupos libres:', cursosDisponibles[0].cupos_reales_disponibles);
    } else {
      await connection.rollback();
      return res.status(400).json({ 
        error: `No hay cursos disponibles con horario ${solicitud.horario_preferido} para el tipo de curso seleccionado. Por favor, crea un curso con este horario primero.` 
      });
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

      // *** NO ES NECESARIO ACTUALIZAR CUPOS DISPONIBLES DEL CURSO ***
      // Los cupos ya fueron actualizados cuando se creó la solicitud
      // El id_curso en la matrícula es el mismo que se asignó en la solicitud
      console.log('ℹ️  Los cupos del curso ya fueron actualizados al crear la solicitud');

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
        console.log('-No se encontró tipo de curso para generar cuotas');
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
            console.error('-Error generando PDF del comprobante (continuando sin PDF):', pdfError);
          }

          // Enviar email de bienvenida con credenciales y PDF del primer pago
          await enviarEmailBienvenidaEstudiante(datosEstudiante, credenciales, pdfComprobante);
          console.log('✅ Email de bienvenida enviado a:', solicitud.email_solicitante);
          if (pdfComprobante) {
            console.log('✅ PDF del primer pago incluido en el email');
          }
          
        } catch (emailError) {
          console.error('-Error enviando email de bienvenida (no afecta la creación):', emailError);
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
    
    // Obtener cursos inscritos para cada estudiante
    for (const estudiante of estudiantes) {
      try {
        const [cursos] = await pool.execute(`
          SELECT 
            c.id_curso,
            c.nombre,
            c.codigo_curso,
            c.horario,
            c.estado
          FROM estudiante_curso ec
          INNER JOIN cursos c ON c.id_curso = ec.id_curso
          WHERE ec.id_estudiante = ?
          ORDER BY c.fecha_inicio DESC
        `, [estudiante.id_usuario]);
        
        estudiante.cursos = cursos;
      } catch (err) {
        console.error(`Error obteniendo cursos del estudiante ${estudiante.id_usuario}:`, err);
        estudiante.cursos = [];
      }
    }
    
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
      estado,
      contacto_emergencia
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
    
    // Actualizar datos en la tabla usuarios
    await pool.execute(`
      UPDATE usuarios 
      SET nombre = ?, apellido = ?, telefono = ?, 
          fecha_nacimiento = ?, genero = ?, direccion = ?, estado = ?
      WHERE id_usuario = ?
    `, [nombre, apellido, telefono, fecha_nacimiento, genero, direccion, estado, id]);
    
    // Si se proporciona contacto_emergencia, actualizar en la tabla solicitudes_matricula
    if (contacto_emergencia !== undefined) {
      // Obtener la cédula del estudiante
      const [userData] = await pool.execute(`
        SELECT cedula FROM usuarios WHERE id_usuario = ?
      `, [id]);
      
      if (userData.length > 0) {
        const cedula = userData[0].cedula;
        
        // Actualizar el contacto de emergencia en la solicitud aprobada más reciente
        await pool.execute(`
          UPDATE solicitudes_matricula 
          SET contacto_emergencia = ?
          WHERE identificacion_solicitante = ? AND estado = 'aprobado'
          ORDER BY fecha_solicitud DESC
          LIMIT 1
        `, [contacto_emergencia, cedula]);
      }
    }
    
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

// Generar reporte Excel de estudiantes
exports.generarReporteExcel = async (req, res) => {
  try {
    // 1. Obtener todos los estudiantes con información completa
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
        s.contacto_emergencia,
        CASE
          WHEN LENGTH(u.cedula) > 10 THEN 'Extranjero'
          ELSE 'Ecuatoriano'
        END as tipo_documento
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      LEFT JOIN solicitudes_matricula s ON s.identificacion_solicitante = u.cedula AND s.estado = 'aprobado'
      WHERE r.nombre_rol = 'estudiante'
      ORDER BY u.fecha_registro DESC
    `);

    // 2. Obtener cursos por estudiante
    const [cursosEstudiantes] = await pool.execute(`
      SELECT 
        ec.id_estudiante,
        c.nombre as curso_nombre,
        c.codigo_curso,
        c.horario,
        tc.nombre as tipo_curso
      FROM estudiante_curso ec
      INNER JOIN cursos c ON c.id_curso = ec.id_curso
      INNER JOIN tipos_cursos tc ON tc.id_tipo_curso = c.id_tipo_curso
      ORDER BY ec.id_estudiante, c.nombre
    `);

    // Mapear cursos por estudiante
    const cursosMap = {};
    cursosEstudiantes.forEach(curso => {
      if (!cursosMap[curso.id_estudiante]) {
        cursosMap[curso.id_estudiante] = [];
      }
      cursosMap[curso.id_estudiante].push(curso);
    });

    // 3. Obtener estadísticas generales
    const [estadisticas] = await pool.execute(`
      SELECT 
        COUNT(*) as total_estudiantes,
        COUNT(CASE WHEN u.estado = 'activo' THEN 1 END) as activos,
        COUNT(CASE WHEN u.estado = 'inactivo' THEN 1 END) as inactivos,
        COUNT(CASE WHEN u.genero = 'masculino' THEN 1 END) as masculinos,
        COUNT(CASE WHEN u.genero = 'femenino' THEN 1 END) as femeninos,
        COUNT(CASE WHEN LENGTH(u.cedula) > 10 THEN 1 END) as extranjeros,
        COUNT(CASE WHEN LENGTH(u.cedula) <= 10 THEN 1 END) as ecuatorianos
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'estudiante'
    `);

    // 4. Obtener distribución por curso
    const [distribucionCursos] = await pool.execute(`
      SELECT 
        c.codigo_curso,
        c.nombre as curso_nombre,
        tc.nombre as tipo_curso,
        c.horario,
        COUNT(ec.id_estudiante) as total_estudiantes
      FROM cursos c
      LEFT JOIN tipos_cursos tc ON tc.id_tipo_curso = c.id_tipo_curso
      LEFT JOIN estudiante_curso ec ON ec.id_curso = c.id_curso
      GROUP BY c.id_curso, c.codigo_curso, c.nombre, tc.nombre, c.horario
      HAVING total_estudiantes > 0
      ORDER BY total_estudiantes DESC
    `);

    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SGA Belleza';
    workbook.created = new Date();

    // ========== HOJA 1: LISTADO DE ESTUDIANTES ==========
    const sheet1 = workbook.addWorksheet('Estudiantes', {
      properties: { tabColor: { argb: 'FFDC2626' } }
    });

    // Encabezados (sin ID interno)
    sheet1.columns = [
      { header: 'Identificación', key: 'cedula', width: 15 },
      { header: 'Nombres', key: 'nombres', width: 20 },
      { header: 'Apellidos', key: 'apellidos', width: 20 },
      { header: 'Username', key: 'username', width: 15 },
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Teléfono', key: 'telefono', width: 12 },
      { header: 'Fecha Nacimiento', key: 'fecha_nac', width: 15 },
      { header: 'Género', key: 'genero', width: 12 },
      { header: 'Tipo Documento', key: 'tipo_doc', width: 15 },
      { header: 'Contacto Emergencia', key: 'contacto_emerg', width: 15 },
      { header: 'Cursos Inscritos', key: 'cursos', width: 40 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Fecha Registro', key: 'fecha_reg', width: 18 }
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
    estudiantes.forEach(est => {
      const cursos = cursosMap[est.id_usuario] || [];
      const cursosTexto = cursos.length > 0 
        ? cursos.map(c => `${c.codigo_curso} - ${c.curso_nombre} (${c.horario})`).join('; ')
        : 'Sin cursos';

      sheet1.addRow({
        cedula: est.identificacion,
        nombres: est.nombre,
        apellidos: est.apellido,
        username: est.username,
        email: est.email,
        telefono: est.telefono || 'N/A',
        fecha_nac: est.fecha_nacimiento ? new Date(est.fecha_nacimiento).toLocaleDateString('es-EC') : 'N/A',
        genero: est.genero ? est.genero.charAt(0).toUpperCase() + est.genero.slice(1) : 'N/A',
        tipo_doc: est.tipo_documento,
        contacto_emerg: est.contacto_emergencia || 'N/A',
        cursos: cursosTexto,
        estado: est.estado.charAt(0).toUpperCase() + est.estado.slice(1),
        fecha_reg: new Date(est.fecha_registro).toLocaleString('es-EC')
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
    sheet2.getCell('A1').value = 'REPORTE ESTADÍSTICO DE ESTUDIANTES';
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
    const total = stats.total_estudiantes;

    // Sección 1: Resumen General
    sheet2.mergeCells('A4:C4');
    sheet2.getCell('A4').value = 'RESUMEN GENERAL';
    sheet2.getCell('A4').font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
    sheet2.getCell('A4').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF2F2' }
    };
    sheet2.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(4).height = 25;

    // Encabezados
    sheet2.getCell('A6').value = 'Categoría';
    sheet2.getCell('B6').value = 'Cantidad';
    sheet2.getCell('C6').value = 'Porcentaje';
    ['A6', 'B6', 'C6'].forEach(cell => {
      sheet2.getCell(cell).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      sheet2.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
      sheet2.getCell(cell).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Datos generales
    const datosGenerales = [
      { categoria: 'Total Estudiantes', cantidad: total, color: 'FF3B82F6' },
      { categoria: '✓ Activos', cantidad: stats.activos, color: 'FF10B981' },
      { categoria: '✗ Inactivos', cantidad: stats.inactivos, color: 'FFEF4444' },
      { categoria: '👨 Masculino', cantidad: stats.masculinos, color: 'FF3B82F6' },
      { categoria: '👩 Femenino', cantidad: stats.femeninos, color: 'FFEC4899' },
      { categoria: '🇪🇨 Ecuatorianos', cantidad: stats.ecuatorianos, color: 'FFF59E0B' },
      { categoria: '🌎 Extranjeros', cantidad: stats.extranjeros, color: 'FF8B5CF6' }
    ];

    let row = 7;
    datosGenerales.forEach(dato => {
      const porcentaje = total > 0 ? ((dato.cantidad / total) * 100).toFixed(1) : '0.0';
      sheet2.getCell(`A${row}`).value = dato.categoria;
      sheet2.getCell(`B${row}`).value = dato.cantidad;
      sheet2.getCell(`C${row}`).value = `${porcentaje}%`;
      
      sheet2.getCell(`B${row}`).alignment = { horizontal: 'center' };
      sheet2.getCell(`C${row}`).alignment = { horizontal: 'center' };
      sheet2.getCell(`C${row}`).font = { bold: true, color: { argb: dato.color } };
      
      row++;
    });

    // Sección 2: Distribución por Curso
    const startRow = row + 2;
    sheet2.mergeCells(`A${startRow}:E${startRow}`);
    sheet2.getCell(`A${startRow}`).value = 'DISTRIBUCIÓN POR CURSO';
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
    sheet2.getCell(`C${headerRow}`).value = 'Tipo';
    sheet2.getCell(`D${headerRow}`).value = 'Horario';
    sheet2.getCell(`E${headerRow}`).value = 'Estudiantes';

    ['A', 'B', 'C', 'D', 'E'].forEach(col => {
      sheet2.getCell(`${col}${headerRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      sheet2.getCell(`${col}${headerRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
      sheet2.getCell(`${col}${headerRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Datos por curso
    let cursoRow = headerRow + 1;
    distribucionCursos.forEach((curso, index) => {
      sheet2.getCell(`A${cursoRow}`).value = curso.codigo_curso;
      sheet2.getCell(`B${cursoRow}`).value = curso.curso_nombre;
      sheet2.getCell(`C${cursoRow}`).value = curso.tipo_curso;
      sheet2.getCell(`D${cursoRow}`).value = curso.horario;
      sheet2.getCell(`E${cursoRow}`).value = curso.total_estudiantes;
      
      sheet2.getCell(`E${cursoRow}`).alignment = { horizontal: 'center' };
      sheet2.getCell(`E${cursoRow}`).font = { bold: true, color: { argb: 'FF10B981' } };
      
      // Filas alternadas
      if (index % 2 === 0) {
        ['A', 'B', 'C', 'D', 'E'].forEach(col => {
          sheet2.getCell(`${col}${cursoRow}`).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }
          };
        });
      }
      
      cursoRow++;
    });

    // Ajustar anchos
    sheet2.getColumn('A').width = 15;
    sheet2.getColumn('B').width = 40;
    sheet2.getColumn('C').width = 25;
    sheet2.getColumn('D').width = 15;
    sheet2.getColumn('E').width = 15;

    // Aplicar bordes
    for (let i = 6; i < row; i++) {
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
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Estudiantes_${fecha}.xlsx`);
    res.send(buffer);

  } catch (error) {
    console.error('Error generando reporte Excel:', error);
    res.status(500).json({ error: 'Error al generar el reporte', details: error.message });
  }
};
