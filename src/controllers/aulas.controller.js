const { pool } = require('../config/database');
const AulasModel = require('../models/aulas.model');
const { registrarAuditoria } = require('../utils/auditoria');

exports.getAulas = async (req, res) => {
  try {
    const filters = {
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      search: req.query.search || '',
      estado: req.query.estado || ''
    };

    const result = await AulasModel.getAll(filters);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('=== ERROR EN GET /api/aulas ===');
    console.error('Error completo:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
      details: error.stack
    });
  }
};

exports.getAulaById = async (req, res) => {
  try {
    const { id } = req.params;

    const [aulas] = await pool.execute(
      'SELECT * FROM aulas WHERE id_aula = ?',
      [id]
    );

    if (aulas.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aula no encontrada'
      });
    }

    res.json({
      success: true,
      aula: aulas[0]
    });

  } catch (error) {
    console.error('Error al obtener aula:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

exports.createAula = async (req, res) => {
  try {
    const { codigo_aula, nombre, ubicacion, descripcion, estado = 'activa' } = req.body;

    // Validaciones
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre del aula es obligatorio'
      });
    }

    if (!codigo_aula || codigo_aula.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El código del aula es obligatorio'
      });
    }

    if (!['activa', 'inactiva', 'mantenimiento', 'reservada'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido'
      });
    }

    // Verificar que no exista aula con el mismo nombre
    const [existingAula] = await pool.execute(
      'SELECT id_aula FROM aulas WHERE nombre = ?',
      [nombre.trim()]
    );

    if (existingAula.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un aula con ese nombre'
      });
    }

    // Verificar que no exista aula con el mismo código
    const [existingCode] = await pool.execute(
      'SELECT id_aula FROM aulas WHERE codigo_aula = ?',
      [codigo_aula.trim()]
    );

    if (existingCode.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un aula con ese código'
      });
    }

    // Insertar nueva aula con código del frontend (igual que en cursos)
    const [result] = await pool.execute(
      `INSERT INTO aulas (codigo_aula, nombre, ubicacion, descripcion, estado) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        codigo_aula.trim(),
        nombre.trim(),
        ubicacion ? ubicacion.trim() : null,
        descripcion ? descripcion.trim() : null,
        estado
      ]
    );

    // Obtener el aula creada con su código generado
    const [newAula] = await pool.execute(
      'SELECT * FROM aulas WHERE id_aula = ?',
      [result.insertId]
    );

    // Registrar auditoría - Admin creó aula
    try {
      // Validar que el usuario esté autenticado
      if (!req.user || !req.user.id_usuario) {
        console.warn('⚠️ No se pudo registrar auditoría: usuario no autenticado');
      } else {
        await registrarAuditoria({
          tabla_afectada: 'aulas',
          operacion: 'INSERT',
          id_registro: result.insertId,
          usuario_id: req.user.id_usuario,
          datos_nuevos: {
            id_aula: result.insertId,
            codigo_aula: codigo_aula.trim(),
            nombre: nombre.trim(),
            ubicacion: ubicacion ? ubicacion.trim() : null,
            descripcion: descripcion ? descripcion.trim() : null,
            estado
          },
          ip_address: req.ip || req.connection?.remoteAddress || null,
          user_agent: req.get('user-agent') || null
        });
      }
    } catch (auditError) {
      console.error('Error registrando auditoría de aula (no afecta la creación):', auditError);
    }

    res.status(201).json({
      success: true,
      message: 'Aula creada exitosamente',
      aula: newAula[0]
    });

  } catch (error) {
    console.error('Error al crear aula:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un aula con ese nombre'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

exports.updateAula = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, ubicacion, descripcion, estado } = req.body;

    // Validaciones
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre del aula es obligatorio'
      });
    }

    if (!['activa', 'inactiva', 'mantenimiento', 'reservada'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido'
      });
    }

    // Verificar que el aula existe
    const [existingAula] = await pool.execute(
      'SELECT id_aula FROM aulas WHERE id_aula = ?',
      [id]
    );

    if (existingAula.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aula no encontrada'
      });
    }

    // Verificar que no exista otra aula con el mismo nombre
    const [duplicateAula] = await pool.execute(
      'SELECT id_aula FROM aulas WHERE nombre = ? AND id_aula != ?',
      [nombre.trim(), id]
    );

    if (duplicateAula.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe otra aula con ese nombre'
      });
    }

    // Actualizar aula
    await pool.execute(
      `UPDATE aulas 
       SET nombre = ?, ubicacion = ?, descripcion = ?, estado = ?
       WHERE id_aula = ?`,
      [
        nombre.trim(),
        ubicacion ? ubicacion.trim() : null,
        descripcion ? descripcion.trim() : null,
        estado,
        id
      ]
    );

    // Obtener aula actualizada
    const [updatedAula] = await pool.execute(
      'SELECT * FROM aulas WHERE id_aula = ?',
      [id]
    );

    // Registrar auditoría - Admin actualizó aula
    try {
      const [aulaAnterior] = await pool.execute(
        'SELECT nombre, ubicacion, descripcion, estado FROM aulas WHERE id_aula = ?',
        [id]
      );

      await registrarAuditoria({
        tabla_afectada: 'aulas',
        operacion: 'UPDATE',
        id_registro: parseInt(id),
        usuario_id: req.user?.id_usuario,
        datos_anteriores: aulaAnterior.length > 0 ? aulaAnterior[0] : null,
        datos_nuevos: {
          id_aula: parseInt(id),
          nombre: nombre.trim(),
          ubicacion: ubicacion ? ubicacion.trim() : null,
          descripcion: descripcion ? descripcion.trim() : null,
          estado
        },
        ip_address: req.ip || req.connection?.remoteAddress || null,
        user_agent: req.get('user-agent') || null
      });
    } catch (auditError) {
      console.error('Error registrando auditoría de actualización de aula (no afecta la actualización):', auditError);
    }

    res.json({
      success: true,
      message: 'Aula actualizada exitosamente',
      aula: updatedAula[0]
    });

  } catch (error) {
    console.error('Error al actualizar aula:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Ya existe otra aula con ese nombre'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

exports.deleteAula = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el aula existe
    const [existingAula] = await pool.execute(
      'SELECT id_aula, nombre FROM aulas WHERE id_aula = ?',
      [id]
    );

    if (existingAula.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aula no encontrada'
      });
    }

    // TODO: Verificar si el aula está siendo usada en cursos o asignaciones
    // antes de eliminar (opcional)

    // Registrar auditoría antes de eliminar
    try {
      await registrarAuditoria({
        tabla_afectada: 'aulas',
        operacion: 'DELETE',
        id_registro: parseInt(id),
        usuario_id: req.user?.id_usuario,
        datos_anteriores: {
          id_aula: parseInt(id),
          nombre: existingAula[0].nombre,
          codigo_aula: existingAula[0].codigo_aula || null
        },
        datos_nuevos: null,
        ip_address: req.ip || req.connection?.remoteAddress || null,
        user_agent: req.get('user-agent') || null
      });
    } catch (auditError) {
      console.error('Error registrando auditoría de eliminación de aula (no afecta la eliminación):', auditError);
    }

    // Eliminar aula
    await pool.execute('DELETE FROM aulas WHERE id_aula = ?', [id]);

    res.json({
      success: true,
      message: `Aula "${existingAula[0].nombre}" eliminada exitosamente`
    });

  } catch (error) {
    console.error('Error al eliminar aula:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};
