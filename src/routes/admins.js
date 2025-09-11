const express = require('express');
const multer = require('multer');
const { createAdminController, listAdminsController } = require('../controllers/admins.controller');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Configuración de multer en memoria para no crear carpetas ni escribir a disco
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Tipo de archivo no permitido'));
};

const upload = multer({ storage, fileFilter });

// Crear nuevo administrador (solo superadmin)
router.post('/', authMiddleware, requireRole('superadmin'), upload.single('foto_perfil'), createAdminController);

// Listar administradores (solo superadmin)
router.get('/', authMiddleware, requireRole('superadmin'), listAdminsController);

module.exports = router;
