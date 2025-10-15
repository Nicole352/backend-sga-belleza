const bcrypt = require('bcryptjs');
const usuariosModel = require('../models/usuarios.model');
const { registrarAuditoria } = require('../utils/auditoria');

// ========================================
// GET /api/usuarios - Lista paginada con filtros
// ========================================
async function getUsuarios(req, res) {
  try {
    const { search = '', rol = 'todos', estado = 'todos', page = 1, limit = 10 } = req.query;

    console.log('Parámetros recibidos:', { search, rol, estado, page, limit });

    const result = await usuariosModel.getAllUsersWithFilters({
      search,
      rol,
      estado,
      page,
      limit
    });

    console.log('Resultado obtenido:', { total: result.total, usuarios: result.usuarios.length });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios',
      error: error.message
    });
  }
}

// ========================================
// GET /api/usuarios/stats - Estadísticas
// ========================================
async function getUsuariosStats(req, res) {
  try {
    const stats = await usuariosModel.getControlUsuariosStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
}

// ========================================
// GET /api/usuarios/:id - Detalle de usuario
// ========================================
async function getUsuarioById(req, res) {
  try {
    const { id } = req.params;

    const usuario = await usuariosModel.getUserById(id);

    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Ocultar password en la respuesta
    delete usuario.password;

    res.json({
      success: true,
      usuario
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuario',
      error: error.message
    });
  }
}

// ========================================
// PUT /api/usuarios/:id/estado - Cambiar estado
// ========================================
async function cambiarEstado(req, res) {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    // Validar estado
    if (!['activo', 'inactivo', 'pendiente'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido. Debe ser: activo, inactivo o pendiente'
      });
    }

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Evitar que el admin se desactive a sí mismo
    if (req.user && req.user.id_usuario === parseInt(id) && estado === 'inactivo') {
      return res.status(400).json({
        success: false,
        message: 'No puedes desactivar tu propia cuenta'
      });
    }

    // Cambiar estado
    const estadoAnterior = usuario.estado;
    const usuarioActualizado = await usuariosModel.changeUserStatus(id, estado);

    // Registrar auditoría - Cambio de estado
    await registrarAuditoria(
      'usuarios',
      'UPDATE',
      parseInt(id),
      req.user?.id_usuario || parseInt(id),
      { estado: estadoAnterior },
      { estado: estado },
      req
    );

    res.json({
      success: true,
      message: `Usuario ${estado === 'activo' ? 'activado' : 'desactivado'} correctamente`,
      usuario: {
        id_usuario: usuarioActualizado.id_usuario,
        nombre: usuarioActualizado.nombre,
        apellido: usuarioActualizado.apellido,
        estado: usuarioActualizado.estado
      }
    });
  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado del usuario',
      error: error.message
    });
  }
}

// ========================================
// POST /api/usuarios/:id/reset-password - Resetear contraseña
// ========================================
async function resetPassword(req, res) {
  try {
    const { id } = req.params;

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Generar nueva contraseña temporal (cédula del usuario)
    const nuevaPasswordTemporal = usuario.cedula;

    // Hashear la nueva contraseña
    const passwordHash = await bcrypt.hash(nuevaPasswordTemporal, 10);

    // Actualizar en la base de datos
    await usuariosModel.resetUserPassword(id, nuevaPasswordTemporal, passwordHash);

    // Registrar auditoría - Reset de contraseña
    await registrarAuditoria(
      'usuarios',
      'UPDATE',
      parseInt(id),
      req.user?.id_usuario || parseInt(id),
      null,
      { accion: 'reset_password', needs_password_reset: true },
      req
    );

    res.json({
      success: true,
      message: 'Contraseña reseteada correctamente',
      credenciales: {
        username: usuario.username || usuario.email,
        password_temporal: nuevaPasswordTemporal,
        mensaje: 'El usuario deberá cambiar esta contraseña en su primer inicio de sesión'
      }
    });
  } catch (error) {
    console.error('Error al resetear contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al resetear contraseña',
      error: error.message
    });
  }
}

// ========================================
// GET /api/usuarios/:id/sesiones - Últimas sesiones
// ========================================
async function getSesiones(req, res) {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    const { pool } = require('../config/database');

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Obtener sesiones de la tabla sesiones_usuario
    const [sesiones] = await pool.query(
      `SELECT id_sesion, ip_address, user_agent, fecha_inicio, fecha_expiracion, activa
       FROM sesiones_usuario
       WHERE id_usuario = ?
       ORDER BY fecha_inicio DESC
       LIMIT ?`,
      [id, parseInt(limit)]
    );

    res.json({
      success: true,
      sesiones
    });
  } catch (error) {
    console.error('Error al obtener sesiones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener sesiones',
      error: error.message
    });
  }
}

// ========================================
// GET /api/usuarios/:id/acciones - Últimas acciones
// ========================================
async function getAcciones(req, res) {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;
    const { pool } = require('../config/database');

    // Verificar que el usuario existe
    const usuario = await usuariosModel.getUserById(id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    // Obtener acciones de la tabla auditoria_sistema
    const [acciones] = await pool.query(
      `SELECT id_auditoria, tabla_afectada, operacion, id_registro, ip_address, fecha_operacion
       FROM auditoria_sistema
       WHERE usuario_id = ?
       ORDER BY fecha_operacion DESC
       LIMIT ?`,
      [id, parseInt(limit)]
    );

    res.json({
      success: true,
      acciones
    });
  } catch (error) {
    console.error('Error al obtener acciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener acciones',
      error: error.message
    });
  }
}

module.exports = {
  getUsuarios,
  getUsuariosStats,
  getUsuarioById,
  cambiarEstado,
  resetPassword,
  getSesiones,
  getAcciones
};
