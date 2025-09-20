const express = require('express');
const { getAllUsers, getUserStats, getAdminStats } = require('../models/usuarios.model');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Obtener todos los usuarios (solo superadmin)
router.get('/', authMiddleware, requireRole('superadmin'), async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener estadísticas de usuarios (solo superadmin)
router.get('/stats', authMiddleware, requireRole('superadmin'), async (req, res) => {
  try {
    const stats = await getUserStats();
    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener estadísticas específicas para Admin (admin y superadmin)
router.get('/admin-stats', authMiddleware, async (req, res) => {
  try {
    // Verificar que el usuario sea admin o superadmin
    if (req.user.rol !== 'administrativo' && req.user.rol !== 'superadmin') {
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
