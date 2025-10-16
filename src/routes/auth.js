const express = require('express');
const { loginController, meController, resetPasswordController, logoutController } = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// POST /api/auth/login (con rate limit específico para evitar 429 globales)
router.post('/login', loginLimiter, loginController);

// GET /api/auth/me
router.get('/me', authMiddleware, meController);

// POST /api/auth/reset-password
router.post('/reset-password', authMiddleware, resetPasswordController);

// POST /api/auth/logout
router.post('/logout', authMiddleware, logoutController);

module.exports = router;
