const express = require('express');
const multer = require('multer');
const {
  createAdminController,
  listAdminsController,
  updateAdminController,
  updateAdminPasswordController
} = require('../controllers/admins.controller');
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

// Crear nuevo administrador (permitido para superadmin/admin/administrativo)
router.post('/', authMiddleware, requireRole(['superadmin', 'admin', 'administrativo']), upload.single('foto_perfil'), createAdminController);

// Listar administradores (permitido para superadmin/admin/administrativo)
router.get('/', authMiddleware, requireRole(['superadmin', 'admin', 'administrativo']), listAdminsController);

// Actualizar administrador (datos); acepta foto opcional via multipart
router.put('/:id', authMiddleware, requireRole(['admin', 'administrativo']), upload.single('foto_perfil'), updateAdminController);

// Actualizar contraseña
router.patch('/:id/password', authMiddleware, requireRole(['admin', 'administrativo']), updateAdminPasswordController);

module.exports = router;