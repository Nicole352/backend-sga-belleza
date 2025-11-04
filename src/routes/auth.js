const express = require('express');
const { loginController, meController, resetPasswordController, logoutController } = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

/**
 * @route POST /api/auth/login
 * @desc Autenticar usuario y generar JWT
 * @body { email/username: string, password: string }
 * @returns { token: string, user: object }
 * @rateLimit 30 intentos/5min
 */
router.post('/login', loginLimiter, loginController);

/**
 * @route GET /api/auth/me
 * @desc Obtener información del usuario autenticado
 * @auth Bearer token requerido
 * @returns { user: object }
 */
router.get('/me', authMiddleware, meController);

/**
 * @route POST /api/auth/reset-password
 * @desc Cambiar contraseña del usuario autenticado
 * @auth Bearer token requerido
 * @body { newPassword: string, confirmPassword: string }
 * @returns { message: string }
 */
router.post('/reset-password', authMiddleware, resetPasswordController);

/**
 * @route POST /api/auth/logout
 * @desc Cerrar sesión del usuario
 * @auth Bearer token requerido
 * @returns { message: string }
 */
router.post('/logout', authMiddleware, logoutController);

module.exports = router;
