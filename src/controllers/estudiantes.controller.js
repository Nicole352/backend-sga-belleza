const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const EstudiantesModel = require('../models/estudiantes.model');

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
    
    // 2. Verificar que no exista ya un usuario con esa cédula
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
    
    // 3. Obtener el rol de estudiante
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
    const username = await generateUniqueUsername(
      solicitud.nombre_solicitante, 
      solicitud.apellido_solicitante
    );
    
    // 5. Guardar email personal del solicitante (solo para contacto/notificaciones).
    //    El login de estudiantes sigue siendo exclusivamente por username.
    const emailEstudiante = solicitud.email_solicitante || null;
    
    // 6. Generar contraseña temporal (documento) con bcrypt
    const passwordTemporal = solicitud.identificacion_solicitante;
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
    
    const id_estudiante = userResult.insertId;
    
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
        emailEstudiante || `${username}@estudiante.belleza.com`,
        aprobado_por
      ]);
      
      const id_matricula = matriculaResult.insertId;
      console.log('✅ Matrícula creada:', codigoMatricula, 'ID:', id_matricula);

      // *** GENERAR CUOTAS MENSUALES AUTOMÁTICAMENTE ***
      console.log('🔍 Generando cuotas mensuales para matrícula:', id_matricula);
      
      // Obtener duración del curso en meses
      const [tipoCurso] = await connection.execute(`
        SELECT duracion_meses, precio_base 
        FROM tipos_cursos 
        WHERE id_tipo_curso = ?
      `, [solicitud.id_tipo_curso]);

      console.log('🔍 Tipo de curso encontrado:', tipoCurso);

      if (tipoCurso.length > 0) {
        const duracionMeses = tipoCurso[0].duracion_meses;
        const precioMensual = tipoCurso[0].precio_base / duracionMeses; // Dividir precio base entre meses
        
        console.log('🔍 Generando cuotas:', {
          duracionMeses,
          precioMensual,
          id_matricula
        });
        
        // Generar cuotas mensuales
        const fechaInicio = new Date();
        fechaInicio.setMonth(fechaInicio.getMonth() + 1); // Empezar el próximo mes
        
        for (let i = 1; i <= duracionMeses; i++) {
          const fechaVencimiento = new Date(fechaInicio);
          fechaVencimiento.setMonth(fechaInicio.getMonth() + (i - 1));
          fechaVencimiento.setDate(15); // Vencimiento el día 15 de cada mes
          
          console.log(`🔍 Creando cuota ${i}:`, {
            id_matricula,
            numero_cuota: i,
            monto: precioMensual,
            fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0]
          });
          
          // *** CUOTA #1: Copiar datos del pago de la solicitud (YA PAGADA) ***
          if (i === 1) {
            console.log('💰 Cuota #1: Copiando datos de pago de la solicitud');
            await connection.execute(`
              INSERT INTO pagos_mensuales (
                id_matricula, 
                numero_cuota, 
                monto, 
                fecha_vencimiento, 
                fecha_pago,
                metodo_pago,
                numero_comprobante,
                banco_comprobante,
                fecha_transferencia,
                comprobante_pago_blob,
                comprobante_mime,
                comprobante_size_kb,
                comprobante_nombre_original,
                estado
              ) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, 'pagado')
            `, [
              id_matricula,
              i,
              solicitud.monto_matricula || precioMensual, // Usar monto de solicitud si existe
              fechaVencimiento.toISOString().split('T')[0],
              solicitud.metodo_pago,
              solicitud.numero_comprobante,
              solicitud.banco_comprobante,
              solicitud.fecha_transferencia,
              solicitud.comprobante_pago,
              solicitud.comprobante_mime,
              solicitud.comprobante_size_kb,
              solicitud.comprobante_nombre_original
            ]);
            console.log('✅ Cuota #1 creada con estado PAGADO (datos de solicitud copiados)');
          } else {
            // Cuotas 2, 3, 4... en estado pendiente
            await connection.execute(`
              INSERT INTO pagos_mensuales (
                id_matricula, numero_cuota, monto, fecha_vencimiento, estado, metodo_pago
              ) VALUES (?, ?, ?, ?, 'pendiente', 'transferencia')
            `, [
              id_matricula,
              i,
              precioMensual,
              fechaVencimiento.toISOString().split('T')[0]
            ]);
          }
        }
        
        console.log('✅ Cuotas generadas exitosamente para matrícula:', id_matricula);
        console.log('✅ Cuota #1: PAGADO (comprobante copiado de solicitud)');
        console.log(`✅ Cuotas ${duracionMeses > 1 ? '2-' + duracionMeses : ''}: PENDIENTES`);
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
    
    res.json({
      success: true,
      message: 'Estudiante creado exitosamente',
      estudiante: {
        id_usuario: id_estudiante,
        identificacion: solicitud.identificacion_solicitante,
        nombre: solicitud.nombre_solicitante,
        apellido: solicitud.apellido_solicitante,
        email: emailEstudiante,
        username: username,
        password_temporal: passwordTemporal
      }
    });
    
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
