const jwt = require('jsonwebtoken');
const { getUserById } = require('../models/usuarios.model');

// Obtener JWT_SECRET con validación
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET no configurado en producción'); })()
  : 'dev_secret');

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  // Si no hay token en el header, buscar en query params (para imágenes)
  if (!token && req.query.token) {
    token = req.query.token;
    console.log('Token obtenido desde query params para:', req.path);
  }

  if (!token) {
    console.log('No se encontró token en headers ni query params');
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Verificar estado actual del usuario en la base de datos
    const user = await getUserById(payload.id_usuario);

    if (!user) {
      console.log('Usuario no encontrado en BD:', payload.id_usuario);
      return res.status(401).json({ error: "Usuario no encontrado" });
    }

    if (user.estado !== 'activo') {
      console.log('Usuario inactivo intentando acceder:', payload.id_usuario);
      return res.status(403).json({ error: "Usuario inactivo" });
    }

    if (user.cuenta_bloqueada) {
      console.log('Usuario bloqueado intentando acceder:', payload.id_usuario);
      return res.status(403).json({
        error: "Cuenta bloqueada",
        motivo: user.motivo_bloqueo || 'Cuenta bloqueada por el administrador'
      });
    }

    req.user = payload; // { id_usuario, rol, email }
    next();
  } catch (e) {
    console.log('Token inválido:', e.message);
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

function requireRole(rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "No autorizado" });
    }

    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        error: "Acceso denegado",
        rol_actual: req.user.rol,
        roles_requeridos: rolesPermitidos
      });
    }

    next();
  };
}

module.exports = { authMiddleware, requireRole };
