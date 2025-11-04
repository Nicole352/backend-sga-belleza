/**
 * Middleware centralizado para manejo de errores
 * Captura todos los errores no manejados y los formatea consistentemente
 */

function errorHandler(err, req, res, next) {
  // Log del error (mantiene console.error por ahora para no romper nada)
  console.error('-Error capturado:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    user: req.user?.id_usuario || 'no autenticado'
  });

  // Errores de validación
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Error de validación',
      details: err.message 
    });
  }

  // Errores de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token inválido' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expirado' });
  }

  // Errores de MySQL
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ 
      error: 'Registro duplicado',
      details: 'Este valor ya existe en la base de datos'
    });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ 
      error: 'Referencia inválida',
      details: 'El registro relacionado no existe'
    });
  }

  // Errores de Multer (archivos)
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Archivo demasiado grande (máximo 5MB)' });
    }
    return res.status(400).json({ error: 'Error al subir archivo: ' + err.message });
  }

  // Error genérico
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Error interno del servidor' 
    : err.message;

  res.status(statusCode).json({ 
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * Wrapper para funciones async en routes
 * Evita tener que hacer try-catch en cada controlador
 * 
 * Uso:
 * router.get('/ruta', asyncHandler(async (req, res) => {
 *   const data = await modelo.getData();
 *   res.json(data);
 * }));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, asyncHandler };
