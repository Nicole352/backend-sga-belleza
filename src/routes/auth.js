const express = require('express');
const { loginController, meController } = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', loginController);

// GET /api/auth/me
router.get('/me', authMiddleware, meController);

module.exports = router;
