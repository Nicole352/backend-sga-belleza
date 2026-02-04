const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const DocentesModel = require('../models/docentes.model');
const { registrarAuditoria } = require('../utils/auditoria');
const { enviarEmailBienvenidaDocente } = require('../services/emailService');
const ExcelJS = require('exceljs');

// =====================================================
// FUNCIONES AUXILIARES PARA GENERACIÓN DE USERNAME
// =====================================================

// Función para generar username único (igual que estudiantes)
async function generateUniqueUsername(nombres, apellidos) {
  try {
    // Extraer iniciales del nombre (todas las palabras)
    const nombreParts = nombres.trim().split(' ').filter(part => part.length > 0);
    const inicialesNombre = nombreParts.map(part => part.charAt(0).toLowerCase()).join('');

    // Extraer primer apellido
    const apellidoParts = apellidos.trim().split(' ').filter(part => part.length > 0);
    const primerApellido = apellidoParts[0]?.toLowerCase() || '';

    // Crear username base
    const baseUsername = inicialesNombre + primerApellido;

    // Verificar si el username ya existe (en tabla usuarios, no docentes)
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
    const inicialesNombre = nombres.charAt(0).toLowerCase();
    const primerApellido = apellidos.split(' ')[0]?.toLowerCase() || '';
    return inicialesNombre + primerApellido + Math.floor(Math.random() * 100);
  }
}

// =====================================================
// CONTROLADORES DE DOCENTES
// =====================================================

exports.getDocentes = async (req, res) => {
  try {
    console.log('=== INICIANDO GET /api/docentes ===');

    const filters = {
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      search: req.query.search || '',
      estado: req.query.estado || ''
    };

    console.log('Parámetros recibidos:', filters);

    const result = await DocentesModel.getAll(filters);
    const { docentes, total } = result;

    console.log('Total docentes en BD:', total);
    console.log(`Mostrando docentes:`, docentes.length);

    // Agregar datos de usuarios si existen
    const docentesFormateados = [];

    for (const docente of docentes) {
      try {
        // Buscar datos del usuario usando el modelo
        const usuario = await DocentesModel.getWithUserData(docente.identificacion);

        if (usuario) {
          docentesFormateados.push({
            ...docente,
            telefono: usuario.telefono || '',
            genero: usuario.genero || '',
            direccion: usuario.direccion || '',
            gmail: usuario.email || '',
            username: usuario.username || '',
            password_temporal: usuario.password_temporal || '',
            estado: usuario.estado || docente.estado
          });
        } else {
          // Si no hay usuario, usar campos vacíos
          docentesFormateados.push({
            ...docente,
            telefono: '',
            genero: '',
            direccion: '',
            gmail: '',
            username: '',
            password_temporal: ''
          });
        }
      } catch (userError) {
        console.error('Error obteniendo usuario para:', docente.identificacion, userError);
        // En caso de error, usar campos vacíos
        docentesFormateados.push({
          ...docente,
          telefono: '',
          genero: '',
          direccion: '',
          gmail: '',
          username: '',
          password_temporal: ''
        });
      }
    }

    // Enviar respuesta
    res.set('X-Total-Count', total.toString());
    res.json(docentesFormateados);

  } catch (error) {
    console.error('=== ERROR EN GET /api/docentes ===');
    console.error('Error completo:', error);
    console.error('Stack trace:', error.stack);

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

exports.getDocenteById = async (req, res) => {
  try {
    const { id } = req.params;

    const [docentes] = await pool.execute(
      'SELECT * FROM docentes WHERE id_docente = ?',
      [id]
    );

    if (docentes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Docente no encontrado'
      });
    }

    res.json({
      success: true,
      docente: docentes[0]
    });

  } catch (error) {
    console.error('Error al obtener docente:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

exports.createDocente = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      identificacion,
      nombres,
      apellidos,
      fecha_nacimiento,
      titulo_profesional,
      gmail,
      experiencia_anos = 0,
      estado = 'activo'
    } = req.body;

    // Validaciones obligatorias
    if (!identificacion || identificacion.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'La identificación es obligatoria'
      });
    }

    if (!nombres || nombres.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Los nombres son obligatorios'
      });
    }

    if (!apellidos || apellidos.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Los apellidos son obligatorios'
      });
    }

    if (!titulo_profesional || titulo_profesional.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El título profesional es obligatorio'
      });
    }

    if (!['activo', 'inactivo'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido'
      });
    }

    // 1. Verificar que no exista usuario con la misma cédula
    const [existingUser] = await connection.execute(
      'SELECT id_usuario FROM usuarios WHERE cedula = ?',
      [identificacion.trim()]
    );

    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con esa identificación'
      });
    }

    // 2. Verificar email único si se proporciona
    if (gmail && gmail.trim() !== '') {
      const [existingEmail] = await connection.execute(
        'SELECT id_usuario FROM usuarios WHERE email = ?',
        [gmail.trim()]
      );

      if (existingEmail.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Ya existe un usuario con ese email'
        });
      }
    }

    // 3. Obtener el rol de docente
    const [roles] = await connection.execute(
      'SELECT id_rol FROM roles WHERE nombre_rol = ?',
      ['docente']
    );

    let id_rol_docente;
    if (roles.length === 0) {
      // Crear rol docente si no existe
      const [roleResult] = await connection.execute(
        'INSERT INTO roles (nombre_rol, descripcion, estado) VALUES (?, ?, ?)',
        ['docente', 'Docente del sistema', 'activo']
      );
      id_rol_docente = roleResult.insertId;
    } else {
      id_rol_docente = roles[0].id_rol;
    }

    // 4. Generar username único
    const username = await generateUniqueUsername(nombres, apellidos);

    // 5. Generar contraseña temporal (identificación) con bcrypt
    const passwordTemporal = identificacion.trim();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(passwordTemporal, salt);

    // 6. Crear usuario docente
    const [userResult] = await connection.execute(`
      INSERT INTO usuarios (
        cedula, nombre, apellido, fecha_nacimiento, telefono, genero, 
        direccion, email, username, password, password_temporal, id_rol, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      identificacion.trim(),
      nombres.trim(),
      apellidos.trim(),
      fecha_nacimiento || null,
      req.body.telefono || null,
      req.body.genero || null,
      req.body.direccion || null,
      gmail ? gmail.trim() : null,
      username,
      hashedPassword,
      passwordTemporal,
      id_rol_docente,
      estado
    ]);

    // 7. Crear registro en tabla docentes (sin username ni password_temporal duplicados)
    const [docenteResult] = await connection.execute(`
      INSERT INTO docentes (
        identificacion, 
        nombres, 
        apellidos, 
        fecha_nacimiento,
        titulo_profesional,
        experiencia_anos
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      identificacion.trim(),
      nombres.trim(),
      apellidos.trim(),
      fecha_nacimiento || null,
      titulo_profesional.trim(),
      parseInt(experiencia_anos) || 0
    ]);

    await connection.commit();

    // Registrar auditoría - Creación de docente
    await registrarAuditoria({
      tabla_afectada: 'docentes',
      operacion: 'INSERT',
      id_registro: docenteResult.insertId,
      usuario_id: req.user?.id_usuario || userResult.insertId,
      datos_anteriores: null,
      datos_nuevos: {
        identificacion: identificacion.trim(),
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        titulo_profesional: titulo_profesional.trim()
      },
      ip_address: req.ip || req.connection?.remoteAddress || null,
      user_agent: req.get('user-agent') || null
    });

    // Registrar auditoría - Creación de usuario
    await registrarAuditoria({
      tabla_afectada: 'usuarios',
      operacion: 'INSERT',
      id_registro: userResult.insertId,
      usuario_id: req.user?.id_usuario || userResult.insertId,
      datos_anteriores: null,
      datos_nuevos: {
        cedula: identificacion.trim(),
        nombre: nombres.trim(),
        apellido: apellidos.trim(),
        username: username,
        rol: 'docente'
      },
      ip_address: req.ip || req.connection?.remoteAddress || null,
      user_agent: req.get('user-agent') || null
    });


    // Enviar email de bienvenida si el docente tiene email
    if (gmail && gmail.trim() !== '') {
      try {
        await enviarEmailBienvenidaDocente(
          {
            cedula: identificacion.trim(),
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            email: gmail.trim()
          },
          {
            username: username,
            password: passwordTemporal
          }
        );
        console.log('Email de bienvenida enviado al docente:', gmail.trim());
      } catch (emailError) {
        console.error('Error enviando email de bienvenida (no critico):', emailError);
      }
    }
    res.status(201).json({
      success: true,
      message: 'Docente creado exitosamente',
      docente: {
        id_docente: docenteResult.insertId,
        id_usuario: userResult.insertId,
        identificacion: identificacion.trim(),
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        fecha_nacimiento: fecha_nacimiento || null,
        telefono: req.body.telefono || null,
        genero: req.body.genero || null,
        direccion: req.body.direccion || null,
        titulo_profesional: titulo_profesional.trim(),
        gmail: gmail ? gmail.trim() : null,
        username: username,
        password_temporal: passwordTemporal,
        experiencia_anos: parseInt(experiencia_anos) || 0,
        estado: estado
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error al crear docente:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('cedula')) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un usuario con esa identificación'
        });
      } else if (error.message.includes('email')) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un usuario con ese email'
        });
      } else if (error.message.includes('username')) {
        return res.status(400).json({
          success: false,
          message: 'Error al generar username único'
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

exports.updateDocente = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const {
      identificacion,
      nombres,
      apellidos,
      fecha_nacimiento,
      titulo_profesional,
      gmail,
      telefono,
      genero,
      direccion,
      experiencia_anos,
      estado
    } = req.body;

    // Validaciones obligatorias
    if (!identificacion || identificacion.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'La identificación es obligatoria'
      });
    }

    if (!nombres || nombres.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Los nombres son obligatorios'
      });
    }

    if (!apellidos || apellidos.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Los apellidos son obligatorios'
      });
    }

    if (!titulo_profesional || titulo_profesional.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El título profesional es obligatorio'
      });
    }

    if (!['activo', 'inactivo'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido'
      });
    }

    await connection.beginTransaction();

    // Verificar que el docente existe y obtener todos sus datos actuales
    // Usamos connection.execute para estar dentro de la transacción (aunque sea lectura)
    const [existingDocente] = await connection.execute(
      `SELECT id_docente, identificacion, nombres, apellidos, fecha_nacimiento, 
              titulo_profesional, experiencia_anos, estado 
       FROM docentes WHERE id_docente = ? FOR UPDATE`,
      [id]
    );

    if (existingDocente.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Docente no encontrado'
      });
    }

    const oldDocente = existingDocente[0];

    // 1. Actualizar tabla docentes
    await connection.execute(
      `UPDATE docentes 
       SET identificacion = ?, 
           nombres = ?, 
           apellidos = ?, 
           fecha_nacimiento = ?,
           titulo_profesional = ?,
           experiencia_anos = ?,
           estado = ?
       WHERE id_docente = ?`,
      [
        identificacion.trim(),
        nombres.trim(),
        apellidos.trim(),
        fecha_nacimiento || null,
        titulo_profesional.trim(),
        parseInt(experiencia_anos) || 0,
        estado,
        id
      ]
    );

    // 2. Actualizar tabla usuarios (vinculada por cédula anterior)
    // Es importante buscar por la cédula ANTERIOR para no perder el rastro si cambia la identificación
    await connection.execute(
      `UPDATE usuarios 
       SET cedula = ?,
           nombre = ?,
           apellido = ?,
           fecha_nacimiento = ?,
           telefono = ?,
           genero = ?,
           direccion = ?,
           email = ?,
           estado = ?
       WHERE cedula = ? AND id_rol = (SELECT id_rol FROM roles WHERE nombre_rol = 'docente')`,
      [
        identificacion.trim(),
        nombres.trim(),
        apellidos.trim(),
        fecha_nacimiento || null,
        telefono || null,
        genero || null,
        direccion || null,
        gmail ? gmail.trim() : null,
        estado,
        oldDocente.identificacion // WHERE cedula = old_cedula
      ]
    );

    await connection.commit();

    // Obtener docente actualizado para responder
    const [updatedDocente] = await pool.execute(
      'SELECT * FROM docentes WHERE id_docente = ?',
      [id]
    );

    // Registrar auditoría - Admin actualizó docente
    try {
      if (!req.user || !req.user.id_usuario) {
        console.warn('⚠️ No se pudo registrar auditoría: usuario no autenticado');
      } else {
        await registrarAuditoria({
          tabla_afectada: 'docentes',
          operacion: 'UPDATE',
          id_registro: parseInt(id),
          usuario_id: req.user.id_usuario,
          datos_anteriores: {
            identificacion: oldDocente.identificacion,
            nombres: oldDocente.nombres,
            apellidos: oldDocente.apellidos,
            fecha_nacimiento: oldDocente.fecha_nacimiento,
            titulo_profesional: oldDocente.titulo_profesional,
            experiencia_anos: oldDocente.experiencia_anos,
            estado: oldDocente.estado
          },
          datos_nuevos: {
            identificacion: identificacion.trim(),
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            fecha_nacimiento: fecha_nacimiento || null,
            titulo_profesional: titulo_profesional.trim(),
            experiencia_anos: parseInt(experiencia_anos) || 0,
            estado: estado,
            email: gmail // Agregamos email a la auditoría aunque no esté en tabla docentes explícitamente
          },
          ip_address: req.ip || req.connection?.remoteAddress || null,
          user_agent: req.get('user-agent') || null
        });
      }
    } catch (auditError) {
      console.error('Error registrando auditoría de actualización de docente (no afecta la actualización):', auditError);
    }

    res.json({
      success: true,
      message: 'Docente actualizado exitosamente',
      docente: updatedDocente[0]
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar docente:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('cedula') || error.message.includes('identificacion')) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro usuario/docente con esa identificación'
        });
      } else if (error.message.includes('email')) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro usuario con ese email'
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

exports.deleteDocente = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el docente existe
    const [existingDocente] = await pool.execute(
      'SELECT id_docente, nombres, apellidos FROM docentes WHERE id_docente = ?',
      [id]
    );

    if (existingDocente.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Docente no encontrado'
      });
    }

    // Registrar auditoría antes de desactivar
    try {
      await registrarAuditoria({
        tabla_afectada: 'docentes',
        operacion: 'UPDATE',
        id_registro: parseInt(id),
        usuario_id: req.user?.id_usuario,
        datos_anteriores: {
          id_docente: parseInt(id),
          nombres: existingDocente[0].nombres,
          apellidos: existingDocente[0].apellidos,
          estado: 'activo'
        },
        datos_nuevos: {
          id_docente: parseInt(id),
          nombres: existingDocente[0].nombres,
          apellidos: existingDocente[0].apellidos,
          estado: 'inactivo',
          accion: 'desactivado'
        },
        ip_address: req.ip || req.connection?.remoteAddress || null,
        user_agent: req.get('user-agent') || null
      });
    } catch (auditError) {
      console.error('Error registrando auditoría de desactivación de docente (no afecta la desactivación):', auditError);
    }

    // En lugar de eliminar, cambiar estado a inactivo
    await pool.execute(
      'UPDATE docentes SET estado = ? WHERE id_docente = ?',
      ['inactivo', id]
    );

    res.json({
      success: true,
      message: `Docente "${existingDocente[0].nombres} ${existingDocente[0].apellidos}" desactivado exitosamente`
    });

  } catch (error) {
    console.error('Error al desactivar docente:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

exports.getDocentesStats = async (req, res) => {
  try {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_docentes,
        SUM(CASE WHEN u.estado = 'activo' THEN 1 ELSE 0 END) as docentes_activos,
        SUM(CASE WHEN u.estado = 'inactivo' THEN 1 ELSE 0 END) as docentes_inactivos,
        AVG(d.experiencia_anos) as promedio_experiencia
      FROM docentes d
      INNER JOIN usuarios u ON u.cedula = d.identificacion
      INNER JOIN roles r ON u.id_rol = r.id_rol
      WHERE r.nombre_rol = 'docente'
    `);

    res.json({
      success: true,
      stats: stats[0]
    });

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Generar reporte Excel de docentes
exports.generarReporteExcel = async (req, res) => {
  try {
    // Obtener filtros de la query
    const { search = '', estado = '' } = req.query;

    console.log('📊 Generando Excel Docentes | Filtros:', { search, estado });

    // Construir consulta dinámica
    let baseSql = `
      SELECT 
        d.id_docente,
        d.identificacion,
        d.nombres,
        d.apellidos,
        d.titulo_profesional,
        d.experiencia_anos,
        d.estado,
        d.fecha_creacion,
        u.email,
        u.telefono,
        u.username,
        u.fecha_nacimiento,
        u.direccion,
        u.genero,
        u.fecha_registro
      FROM docentes d
      LEFT JOIN usuarios u ON u.cedula = d.identificacion 
        AND u.id_rol = (SELECT id_rol FROM roles WHERE nombre_rol = 'docente')
      WHERE 1=1
    `;

    const params = [];

    if (estado && estado !== 'todos') {
      baseSql += ` AND d.estado = ?`;
      params.push(estado);
    }

    if (search) {
      baseSql += ` AND (d.nombres LIKE ? OR d.apellidos LIKE ? OR d.identificacion LIKE ? OR u.email LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    baseSql += ` ORDER BY d.apellidos ASC, d.nombres ASC`;

    // 1. Obtener docentes filtrados
    const [docentes] = await pool.execute(baseSql, params);

    // 2. Obtener cursos asignados (activos) para todos los docentes
    const [asignaciones] = await pool.execute(`
      SELECT 
        aa.id_docente,
        c.nombre as curso_nombre,
        c.codigo_curso,
        c.horario,
        a.nombre as aula_nombre,
        aa.dias,
        aa.hora_inicio,
        aa.hora_fin
      FROM asignaciones_aulas aa
      INNER JOIN cursos c ON aa.id_curso = c.id_curso
      LEFT JOIN aulas a ON aa.id_aula = a.id_aula
      WHERE aa.estado = 'activa' 
        AND c.estado IN ('activo', 'planificado')
    `);

    // Mapear cursos por docente
    const cursosMap = {};
    asignaciones.forEach(asig => {
      if (!cursosMap[asig.id_docente]) {
        cursosMap[asig.id_docente] = [];
      }
      cursosMap[asig.id_docente].push(asig);
    });

    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SGA Belleza';
    workbook.created = new Date();

    // ========== HOJA 1: LISTADO DE DOCENTES ==========
    const sheet1 = workbook.addWorksheet('Docentes', {
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

    // 1. Título Principal (Fila 1)
    sheet1.mergeCells(1, 1, 1, 13);
    const titleCell1 = sheet1.getCell(1, 1);
    titleCell1.value = 'REPORTE DE DOCENTES';
    titleCell1.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    titleCell1.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet1.getRow(1).height = 25;

    // 2. Info Dinámica (Fila 2)
    sheet1.mergeCells(2, 1, 2, 13);
    const infoCell1 = sheet1.getCell(2, 1);
    const infoText1 = `FILTROS: ${estado && estado !== 'todos' ? estado.toUpperCase() : 'TODOS'} | TOTAL DOCENTES: ${docentes.length} | GENERADO EL: ${new Date().toLocaleString('es-EC')}`;
    infoCell1.value = infoText1.toUpperCase();
    infoCell1.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCell1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet1.getRow(2).height = 35;

    // 3. Encabezados Tabla (Fila 4)
    const headers = ['#', 'IDENTIFICACIÓN', 'APELLIDOS', 'NOMBRES', 'TÍTULO PROFESIONAL', 'EMAIL', 'TELÉFONO', 'EXP.', 'CURSO ASIGNADO', 'HORARIO', 'USERNAME', 'ESTADO', 'FECHA REGISTRO'];
    const headerRow1 = sheet1.getRow(4);
    headerRow1.height = 35;

    headers.forEach((h, i) => {
      const cell = headerRow1.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    // Configurar anchos de columna
    const colWidths = [6, 16, 20, 20, 20, 25, 14, 8, 20, 15, 15, 12, 18];
    colWidths.forEach((w, i) => {
      sheet1.getColumn(i + 1).width = w;
    });

    // Preparar datos planos
    const datosPlanos = [];
    docentes.forEach(doc => {
      const cursos = cursosMap[doc.id_docente] || [];

      if (cursos.length > 0) {
        cursos.forEach(cur => {
          datosPlanos.push({
            ...doc,
            curso_nombre: cur.curso_nombre,
            curso_horario: cur.horario ? cur.horario.toUpperCase() : 'N/A', // O usar cur.dias + ' ' + cur.hora_inicio
            tiene_curso: true
          });
        });
      } else {
        datosPlanos.push({
          ...doc,
          curso_nombre: 'Sin asignación',
          curso_horario: 'N/A',
          tiene_curso: false
        });
      }
    });

    // Renderizar filas
    let docenteAnterior = null;
    let numeroDocente = 0;
    let filaInicioDocente = 5; // Título(1) + Info(2) + Vacío(3) + Header(4)
    let currentRow = 5;

    datosPlanos.forEach((dato, index) => {
      const esNuevoDocente = docenteAnterior !== dato.id_docente;
      const esUltimoRegistro = index === datosPlanos.length - 1;
      const siguienteEsDiferente = esUltimoRegistro || datosPlanos[index + 1].id_docente !== dato.id_docente;

      if (esNuevoDocente) {
        numeroDocente++;
        filaInicioDocente = currentRow;
      }

      const row = sheet1.addRow([
        esNuevoDocente ? numeroDocente : null,
        esNuevoDocente ? dato.identificacion : null,
        esNuevoDocente ? (dato.apellidos ? dato.apellidos.toUpperCase() : null) : null,
        esNuevoDocente ? (dato.nombres ? dato.nombres.toUpperCase() : null) : null,
        esNuevoDocente ? (dato.titulo_profesional ? dato.titulo_profesional.toUpperCase() : 'N/A') : null,
        esNuevoDocente ? (dato.email ? dato.email.toLowerCase() : 'N/A') : null,
        esNuevoDocente ? (dato.telefono ? dato.telefono.toUpperCase() : 'N/A') : null,
        esNuevoDocente ? (dato.experiencia_anos || 0) : null,
        (dato.curso_nombre ? dato.curso_nombre.toUpperCase() : 'SIN ASIGNACIÓN'),
        (dato.curso_horario ? dato.curso_horario.toUpperCase() : 'N/A'),
        esNuevoDocente ? (dato.username ? dato.username.toLowerCase() : 'N/A') : null,
        esNuevoDocente ? (dato.estado ? dato.estado.toUpperCase() : 'N/A') : null,
        esNuevoDocente ? (dato.fecha_creacion ? new Date(dato.fecha_creacion) : new Date()) : null
      ]);

      // Formatear celdas de la fila
      row.eachCell((cell, colNumber) => {
        cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF000000' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        // Formatos específicos
        if (colNumber === 1 || colNumber === 8) cell.numFmt = '0';
        if (colNumber === 13) cell.numFmt = 'dd/mm/yyyy';

        // Alineación izquierda para nombres y planes
        if ([3, 4, 5, 6, 9].includes(colNumber)) {
          cell.alignment.horizontal = 'left';
        }
      });

      // Merge de celdas
      if (siguienteEsDiferente && currentRow > filaInicioDocente) {
        // Columnas a combinar: A(#), B(ID), C(Apell), D(Nom), E(Tit), F(Email), G(Tel), H(Exp), K(User), L(Est), M(Fec)
        const columnasMerge = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'M'];
        columnasMerge.forEach(col => {
          try {
            sheet1.mergeCells(`${col}${filaInicioDocente}:${col}${currentRow}`);
            const cell = sheet1.getCell(`${col}${filaInicioDocente}`);
            cell.alignment = {
              horizontal: cell.alignment?.horizontal || 'left',
              vertical: 'middle',
              wrapText: true
            };
          } catch (e) { }
        });
      }

      docenteAnterior = dato.id_docente;
      currentRow++;
    });

    // No es necesario el bucle alternado con el nuevo estilo B&W sólido

    // ========== HOJA 2: RESUMEN ESTADÍSTICO ==========
    const sheet2 = workbook.addWorksheet('Resumen Estadístico', {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9, // A4
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Calcular Estadísticas
    const totalDocentes = docentes.length;
    const activos = docentes.filter(d => d.estado === 'activo').length;
    const inactivos = docentes.filter(d => d.estado === 'inactivo').length;
    const totalExperiencia = docentes.reduce((acc, curr) => acc + (parseInt(curr.experiencia_anos) || 0), 0);
    const promedioExperiencia = totalDocentes > 0 ? (totalExperiencia / totalDocentes).toFixed(1) : '0.0';

    // Agrupar por Título
    const titulosMap = {};
    docentes.forEach(d => {
      const titulo = d.titulo_profesional ? d.titulo_profesional.toUpperCase().trim() : 'SIN TÍTULO';
      titulosMap[titulo] = (titulosMap[titulo] || 0) + 1;
    });
    const distribucionTitulos = Object.keys(titulosMap).map(key => ({ titulo: key, cantidad: titulosMap[key] }));

    // Título Hoja Est
    sheet2.mergeCells('A1:C1');
    const titleCell2 = sheet2.getCell('A1');
    titleCell2.value = 'RESUMEN ESTADÍSTICO DE DOCENTES';
    titleCell2.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(1).height = 25;

    // Subtítulo (Generado el)
    sheet2.mergeCells('A2:C2');
    const infoCell2 = sheet2.getCell('A2');
    const infoText2 = `GENERADO EL: ${new Date().toLocaleString('es-EC').toUpperCase()}`;
    infoCell2.value = infoText2;
    infoCell2.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCell2.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(2).height = 35;

    // Fila 3 vacía

    // Sección 1: Resumen General
    sheet2.mergeCells('A4:C4');
    const section1Header = sheet2.getCell('A4');
    section1Header.value = 'RESUMEN GENERAL';
    section1Header.font = { bold: true, size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    section1Header.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(4).height = 25;

    // Encabezados Tabla 1
    const headersStats1 = ['MÉTRICA', 'CANTIDAD', 'PORCENTAJE'];
    headersStats1.forEach((h, i) => {
      const cell = sheet2.getCell(5, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    sheet2.getRow(5).height = 30;

    // Datos Tabla 1
    const statsData = [
      { metrica: 'TOTAL DOCENTES', cantidad: totalDocentes },
      { metrica: 'DOCENTES ACTIVOS', cantidad: activos },
      { metrica: 'DOCENTES INACTIVOS', cantidad: inactivos },
      { metrica: 'PROMEDIO EXPERIENCIA (AÑOS)', cantidad: promedioExperiencia, esTexto: true }
    ];

    let currentRowStats = 6;
    statsData.forEach(d => {
      const porcentaje = !d.esTexto && totalDocentes > 0 ? d.cantidad / totalDocentes : null;

      const cellMet = sheet2.getCell(currentRowStats, 1);
      const cellCant = sheet2.getCell(currentRowStats, 2);
      const cellPorc = sheet2.getCell(currentRowStats, 3);

      cellMet.value = d.metrica;
      cellCant.value = d.cantidad;
      cellPorc.value = porcentaje;

      [cellMet, cellCant, cellPorc].forEach((c, idx) => {
        c.font = {
          size: 10,
          color: { argb: 'FF000000' },
          name: 'Calibri',
          bold: idx === 0 // Negrita primera columna
        };
        c.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        c.alignment = { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' };
      });

      if (porcentaje !== null) cellPorc.numFmt = '0.0%';
      currentRowStats++;
    });

    // Sección 2: Distribución por Título
    const startRowSec2 = currentRowStats + 2;
    sheet2.mergeCells(`A${startRowSec2}:C${startRowSec2}`);
    const section2Header = sheet2.getCell(startRowSec2, 1);
    section2Header.value = 'DISTRIBUCIÓN POR TÍTULO PROFESIONAL';
    section2Header.font = { bold: true, size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    section2Header.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet2.getRow(startRowSec2).height = 25;

    // Encabezados Tabla 2
    const headersStats2 = ['TÍTULO', 'CANTIDAD', 'PORCENTAJE'];
    const rowHeader2 = startRowSec2 + 2;
    headersStats2.forEach((h, i) => {
      const cell = sheet2.getCell(rowHeader2, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Datos Tabla 2
    let currentRowStats2 = rowHeader2 + 1;
    distribucionTitulos.forEach(d => {
      const porcentaje = totalDocentes > 0 ? d.cantidad / totalDocentes : 0;

      const cellTit = sheet2.getCell(currentRowStats2, 1);
      const cellCant = sheet2.getCell(currentRowStats2, 2);
      const cellPorc = sheet2.getCell(currentRowStats2, 3);

      cellTit.value = d.titulo;
      cellCant.value = d.cantidad;
      cellPorc.value = porcentaje;

      [cellTit, cellCant, cellPorc].forEach((c, idx) => {
        c.font = {
          size: 10,
          color: { argb: 'FF000000' },
          name: 'Calibri',
          bold: idx === 0
        };
        c.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        c.alignment = { horizontal: idx === 0 ? 'left' : 'center', vertical: 'middle' };
      });

      cellPorc.numFmt = '0.0%';
      currentRowStats2++;
    });

    // Ajustar anchos Hoja 2
    sheet2.getColumn(1).width = 40;
    sheet2.getColumn(2).width = 15;
    sheet2.getColumn(3).width = 15;

    // Generar buffer
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Docentes_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error generando Excel docentes:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando reporte',
      error: error.message
    });
  }
};

// =====================================================
// ENDPOINTS PARA EL PANEL DEL DOCENTE
// =====================================================

exports.getMisCursos = async (req, res) => {
  try {
    const id_usuario = req.user?.id_usuario;

    if (!id_usuario) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar que el usuario sea docente
    const isDocente = await DocentesModel.isDocente(id_usuario);

    if (!isDocente) {
      return res.status(403).json({ error: 'Acceso denegado. Solo docentes pueden acceder a esta información.' });
    }

    // Obtener ID del docente
    const id_docente = await DocentesModel.getDocenteIdByUserId(id_usuario);

    if (!id_docente) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Obtener cursos asignados
    const todosCursos = await DocentesModel.getMisCursos(id_docente);

    // FILTRAR: Solo devolver cursos ACTIVOS (no finalizados)
    // Un curso está ACTIVO si:
    // - El estado del curso NO es 'finalizado' ni 'cancelado', Y
    // - La fecha de fin NO ha pasado (es hoy o futura)
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Normalizar a medianoche para comparación justa

    const cursosActivos = todosCursos.filter(curso => {
      const fechaFin = new Date(curso.fecha_fin);
      fechaFin.setHours(0, 0, 0, 0); // Normalizar a medianoche

      // Excluir cursos finalizados o cancelados
      if (curso.estado === 'finalizado' || curso.estado === 'cancelado') {
        return false;
      }

      // Excluir cursos cuya fecha de fin ya pasó
      if (fechaFin < hoy) {
        return false;
      }

      // Incluir cursos activos o planificados con fecha futura
      return true;
    });

    console.log(`Cursos activos - Docente ${id_docente}: ${cursosActivos.length} de ${todosCursos.length} total`);

    res.json(cursosActivos);

  } catch (error) {
    console.error('Error obteniendo cursos del docente:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

// GET /api/docentes/todos-mis-cursos - Obtener TODOS los cursos (activos y finalizados) para la vista MisCursos
exports.getTodosMisCursos = async (req, res) => {
  try {
    const id_usuario = req.user?.id_usuario;

    if (!id_usuario) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar que el usuario sea docente
    const isDocente = await DocentesModel.isDocente(id_usuario);

    if (!isDocente) {
      return res.status(403).json({ error: 'Acceso denegado. Solo docentes pueden acceder a esta información.' });
    }

    // Obtener ID del docente
    const id_docente = await DocentesModel.getDocenteIdByUserId(id_usuario);

    if (!id_docente) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Obtener TODOS los cursos asignados (sin filtrar)
    const todosCursos = await DocentesModel.getMisCursos(id_docente);

    console.log(`Todos los cursos - Docente ${id_docente}: ${todosCursos.length} total`);

    res.json(todosCursos);

  } catch (error) {
    console.error('Error obteniendo todos los cursos del docente:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

exports.getMisEstudiantes = async (req, res) => {
  try {
    const id_usuario = req.user?.id_usuario;

    if (!id_usuario) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar que el usuario sea docente
    const isDocente = await DocentesModel.isDocente(id_usuario);

    if (!isDocente) {
      return res.status(403).json({ error: 'Acceso denegado. Solo docentes pueden acceder a esta información.' });
    }

    // Obtener ID del docente
    const id_docente = await DocentesModel.getDocenteIdByUserId(id_usuario);

    if (!id_docente) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Obtener estudiantes
    const estudiantes = await DocentesModel.getMisEstudiantes(id_docente);

    res.json(estudiantes);

  } catch (error) {
    console.error('Error obteniendo estudiantes del docente:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};

exports.getMiHorario = async (req, res) => {
  try {
    const id_usuario = req.user?.id_usuario;

    if (!id_usuario) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Verificar que el usuario sea docente
    const isDocente = await DocentesModel.isDocente(id_usuario);

    if (!isDocente) {
      return res.status(403).json({ error: 'Acceso denegado. Solo docentes pueden acceder a esta información.' });
    }

    // Obtener ID del docente
    const id_docente = await DocentesModel.getDocenteIdByUserId(id_usuario);

    if (!id_docente) {
      return res.status(404).json({ error: 'Docente no encontrado' });
    }

    // Obtener horario
    const horario = await DocentesModel.getMiHorario(id_docente);

    res.json(horario);

  } catch (error) {
    console.error('Error obteniendo horario del docente:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message
    });
  }
};




