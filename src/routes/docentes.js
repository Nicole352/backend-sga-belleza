const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const router = express.Router();

// =====================================================
// FUNCIONES AUXILIARES PARA GENERACIÓN DE USERNAME
// =====================================================

// Función para generar iniciales del nombre
function generateInitials(nombres, apellidos) {
  const nombresArray = nombres.trim().split(' ').filter(n => n.length > 0);
  const apellidosArray = apellidos.trim().split(' ').filter(a => a.length > 0);
  
  // Tomar primera letra de cada nombre y primer apellido completo
  const inicialesNombres = nombresArray.map(n => n.charAt(0).toUpperCase()).join('');
  const primerApellido = apellidosArray[0] ? apellidosArray[0].toLowerCase() : '';
  
  return inicialesNombres + primerApellido;
}

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
// ENDPOINTS PARA GESTIÓN DE DOCENTES
// =====================================================

// GET /api/docentes - Obtener docentes con paginación y filtros
router.get('/', async (req, res) => {
  try {
    console.log('=== INICIANDO GET /api/docentes ===');
    
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      estado = '' 
    } = req.query;

    console.log('Parámetros recibidos:', { page, limit, search, estado });

    const offset = (page - 1) * limit;
    
    // Consulta MUY simple primero - sin LIMIT
    const docentesQuery = `
      SELECT 
        id_docente,
        identificacion,
        nombres,
        apellidos,
        fecha_nacimiento,
        titulo_profesional,
        experiencia_anos,
        estado,
        fecha_creacion
      FROM docentes
      ORDER BY apellidos ASC, nombres ASC
    `;
    
    console.log('Ejecutando consulta básica:', docentesQuery);
    
    const [allDocentes] = await pool.execute(docentesQuery);
    
    console.log('Total docentes en BD:', allDocentes.length);
    
    // Aplicar paginación manualmente
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const docentes = allDocentes.slice(startIndex, endIndex);
    
    console.log(`Mostrando docentes ${startIndex} a ${endIndex}:`, docentes.length);
    
    // Total es el length del array completo
    const total = allDocentes.length;
    
    console.log('Total docentes:', total);
    
    // Agregar datos de usuarios si existen
    const docentesFormateados = [];
    
    for (const docente of docentes) {
      try {
        // Buscar datos del usuario
        const [usuarios] = await pool.execute(
          'SELECT telefono, genero, direccion, email, username, password_temporal, estado FROM usuarios WHERE cedula = ? LIMIT 1',
          [docente.identificacion]
        );
        
        if (usuarios.length > 0) {
          const usuario = usuarios[0];
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
});

// GET /api/docentes/:id - Obtener docente específico
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [docentes] = await db.execute(
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
});

// POST /api/docentes - Crear nuevo docente
router.post('/', async (req, res) => {
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
});

// PUT /api/docentes/:id - Actualizar docente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      identificacion, 
      nombres, 
      apellidos, 
      fecha_nacimiento,
      titulo_profesional,
      gmail,
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
    
    // Verificar que el docente existe
    const [existingDocente] = await db.execute(
      'SELECT id_docente, nombres, apellidos, username FROM docentes WHERE id_docente = ?',
      [id]
    );
    
    if (existingDocente.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Docente no encontrado'
      });
    }
    
    // Verificar que no exista otro docente con la misma identificación
    const [duplicateIdentificacion] = await db.execute(
      'SELECT id_docente FROM docentes WHERE identificacion = ? AND id_docente != ?',
      [identificacion.trim(), id]
    );
    
    if (duplicateIdentificacion.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe otro docente con esa identificación'
      });
    }
    
    // Verificar que no exista otro docente con el mismo gmail (si se proporciona)
    if (gmail && gmail.trim() !== '') {
      const [duplicateGmail] = await db.execute(
        'SELECT id_docente FROM docentes WHERE gmail = ? AND id_docente != ?',
        [gmail.trim(), id]
      );
      
      if (duplicateGmail.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro docente con ese email'
        });
      }
    }
    
    // Verificar si cambió el nombre para regenerar username
    let newUsername = existingDocente[0].username;
    const currentNombres = existingDocente[0].nombres;
    const currentApellidos = existingDocente[0].apellidos;
    
    if (nombres.trim() !== currentNombres || apellidos.trim() !== currentApellidos) {
      // Regenerar username si cambió el nombre
      newUsername = await generateUniqueUsername(nombres, apellidos);
    }
    
    // Actualizar docente
    await db.execute(
      `UPDATE docentes 
       SET identificacion = ?, 
           nombres = ?, 
           apellidos = ?, 
           fecha_nacimiento = ?,
           titulo_profesional = ?,
           gmail = ?,
           username = ?,
           password_temporal = ?,
           experiencia_anos = ?,
           estado = ?
       WHERE id_docente = ?`,
      [
        identificacion.trim(),
        nombres.trim(),
        apellidos.trim(),
        fecha_nacimiento || null,
        titulo_profesional.trim(),
        gmail ? gmail.trim() : null,
        newUsername,
        identificacion.trim(), // Contraseña temporal siempre es la identificación
        parseInt(experiencia_anos) || 0,
        estado,
        id
      ]
    );
    
    // Obtener docente actualizado
    const [updatedDocente] = await db.execute(
      'SELECT * FROM docentes WHERE id_docente = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Docente actualizado exitosamente',
      docente: updatedDocente[0]
    });
    
  } catch (error) {
    console.error('Error al actualizar docente:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('identificacion')) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro docente con esa identificación'
        });
      } else if (error.message.includes('gmail')) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe otro docente con ese email'
        });
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// DELETE /api/docentes/:id - Eliminar docente (cambiar estado a inactivo)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar que el docente existe
    const [existingDocente] = await db.execute(
      'SELECT id_docente, nombres, apellidos FROM docentes WHERE id_docente = ?',
      [id]
    );
    
    if (existingDocente.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Docente no encontrado'
      });
    }
    
    // En lugar de eliminar, cambiar estado a inactivo
    await db.execute(
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
});

// GET /api/docentes/stats - Estadísticas de docentes
router.get('/stats/general', async (req, res) => {
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
});

module.exports = router;
