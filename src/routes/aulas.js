const express = require('express');
const { listAulas, createAula } = require('../controllers/aulas.controller');

const router = express.Router();

// GET /api/aulas?estado=disponible&limit=200
router.get('/', listAulas);

// POST /api/aulas
router.post('/', createAula);

module.exports = router;
