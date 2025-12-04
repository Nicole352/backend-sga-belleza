const multer = require('multer');

/**
 * Configuración de Multer para subir archivos a MEMORIA (no a disco)
 * Los archivos se guardarán directamente en la base de datos como BLOB
 */

// Almacenamiento en memoria (Buffer)
const storage = multer.memoryStorage();

// Filtro para validar tipos de archivo
const fileFilter = (req, file, cb) => {
  // Tipos MIME permitidos para imágenes
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // Aceptar archivo
  } else {
    cb(new Error('Formato de imagen no válido. Solo se permiten: JPG, JPEG, PNG, WEBP'), false);
  }
};

// Configuración de Multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB máximo
  }
});

// Middleware para manejar errores de Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'El archivo es demasiado grande. Tamaño máximo: 2 MB'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Error al subir archivo: ${err.message}`
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

module.exports = {
  upload,
  handleMulterError
};
