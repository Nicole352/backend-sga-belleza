const express = require('express');
const { getAllUsers, getUserStats, getAdminStats } = require('../models/usuarios.model');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Obtener todos los usuarios (superadmin, admin, administrativo)
router.get('/', authMiddleware, requireRole(['superadmin', 'admin', 'administrativo']), async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener estadísticas de usuarios (superadmin, admin, administrativo)
router.get('/stats', authMiddleware, requireRole(['superadmin', 'admin', 'administrativo']), async (req, res) => {
  try {
    const stats = await getUserStats();
    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener estadísticas específicas para Admin (superadmin, admin y administrativo)
router.get('/admin-stats', authMiddleware, async (req, res) => {
  try {
    // Verificar que el usuario sea superadmin, admin o administrativo
    if (req.user.rol !== 'superadmin' && req.user.rol !== 'admin' && req.user.rol !== 'administrativo') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const stats = await getAdminStats();
    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo estadísticas de admin:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
