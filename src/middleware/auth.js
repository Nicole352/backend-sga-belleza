const jwt = require('jsonwebtoken');

// Obtener JWT_SECRET con validación
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' 
  ? (() => { throw new Error('JWT_SECRET no configurado en producción'); })()
  : 'dev_secret');

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id_usuario, rol, email }
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

function requireRole(rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      console.log('❌ requireRole: No hay req.user');
      return res.status(401).json({ error: "No autorizado" });
    }
    
    console.log('🔍 requireRole - Usuario:', req.user.id_usuario, 'Rol:', req.user.rol);
    console.log('🔍 requireRole - Roles permitidos:', rolesPermitidos);
    
    if (!rolesPermitidos.includes(req.user.rol)) {
      console.log('❌ requireRole: Acceso denegado. Rol', req.user.rol, 'no está en', rolesPermitidos);
      return res.status(403).json({ 
        error: "Acceso denegado", 
        rol_actual: req.user.rol,
        roles_requeridos: rolesPermitidos 
      });
    }
    
    console.log('✅ requireRole: Acceso permitido');
    next();
  };
}

module.exports = { authMiddleware, requireRole };
