const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// =====================================================
// ENDPOINTS PARA GESTIÓN DE AULAS
// =====================================================

// (debug endpoint removed)

// GET /api/aulas - Obtener aulas con paginación y filtros
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      estado = '' 
    } = req.query;

    // Sanitizar valores como enteros para usar inline (igual que en cursos)
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 10));
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const offset = (safePage - 1) * safeLimit;
    
    // Construir condiciones WHERE
    let whereConditions = [];
    let queryParams = [];
    
    if (search) {
      whereConditions.push('(codigo_aula LIKE ? OR nombre LIKE ? OR ubicacion LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (estado && estado !== 'todos') {
      whereConditions.push('estado = ?');
      queryParams.push(estado);
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';
    
    // Consulta para obtener aulas (LIMIT/OFFSET inline para evitar ER_WRONG_ARGUMENTS)
    const aulasQuery = `
      SELECT 
        id_aula,
        codigo_aula,
        nombre,
        ubicacion,
        descripcion,
        estado,
        fecha_creacion,
        fecha_actualizacion
      FROM aulas 
      ${whereClause}
      ORDER BY codigo_aula ASC
      LIMIT ${safeLimit} OFFSET ${offset}
    `;
    
    // Consulta para contar total
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM aulas 
      ${whereClause}
    `;
    
    // Ejecutar consultas (sin logs verbosos)
    const [aulas] = await pool.execute(aulasQuery, queryParams);
    const [countResult] = await pool.execute(countQuery, queryParams);
    const total = countResult[0].total;
    
    res.json({
      success: true,
      aulas,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit)
    });
    
  } catch (error) {
    console.error('=== ERROR EN GET /api/aulas ===');
    console.error('Error completo:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
      details: error.stack
    });
  }
});

// GET /api/aulas/:id - Obtener aula específica
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [aulas] = await pool.execute(
      'SELECT * FROM aulas WHERE id_aula = ?',
      [id]
    );
    
    if (aulas.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aula no encontrada'
      });
    }
    
    res.json({
      success: true,
      aula: aulas[0]
    });
    
  } catch (error) {
    console.error('Error al obtener aula:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// POST /api/aulas - Crear nueva aula
router.post('/', async (req, res) => {
  try {
    const { codigo_aula, nombre, ubicacion, descripcion, estado = 'activa' } = req.body;
    
    // Validaciones
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre del aula es obligatorio'
      });
    }
    
    if (!codigo_aula || codigo_aula.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El código del aula es obligatorio'
      });
    }
    
    if (!['activa', 'inactiva', 'mantenimiento', 'reservada'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido'
      });
    }
    
    // Verificar que no exista aula con el mismo nombre
    const [existingAula] = await pool.execute(
      'SELECT id_aula FROM aulas WHERE nombre = ?',
      [nombre.trim()]
    );
    
    if (existingAula.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un aula con ese nombre'
      });
    }
    
    // Verificar que no exista aula con el mismo código
    const [existingCode] = await pool.execute(
      'SELECT id_aula FROM aulas WHERE codigo_aula = ?',
      [codigo_aula.trim()]
    );
    
    if (existingCode.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un aula con ese código'
      });
    }
    
    // Insertar nueva aula con código del frontend (igual que en cursos)
    const [result] = await pool.execute(
      `INSERT INTO aulas (codigo_aula, nombre, ubicacion, descripcion, estado) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        codigo_aula.trim(),
        nombre.trim(),
        ubicacion ? ubicacion.trim() : null,
        descripcion ? descripcion.trim() : null,
        estado
      ]
    );
    
    // Obtener el aula creada con su código generado
    const [newAula] = await pool.execute(
      'SELECT * FROM aulas WHERE id_aula = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Aula creada exitosamente',
      aula: newAula[0]
    });
    
  } catch (error) {
    console.error('Error al crear aula:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un aula con ese nombre'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// PUT /api/aulas/:id - Actualizar aula
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, ubicacion, descripcion, estado } = req.body;
    
    // Validaciones
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre del aula es obligatorio'
      });
    }
    
    if (!['activa', 'inactiva', 'mantenimiento', 'reservada'].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado inválido'
      });
    }
    
    // Verificar que el aula existe
    const [existingAula] = await pool.execute(
      'SELECT id_aula FROM aulas WHERE id_aula = ?',
      [id]
    );
    
    if (existingAula.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aula no encontrada'
      });
    }
    
    // Verificar que no exista otra aula con el mismo nombre
    const [duplicateAula] = await pool.execute(
      'SELECT id_aula FROM aulas WHERE nombre = ? AND id_aula != ?',
      [nombre.trim(), id]
    );
    
    if (duplicateAula.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe otra aula con ese nombre'
      });
    }
    
    // Actualizar aula
    await pool.execute(
      `UPDATE aulas 
       SET nombre = ?, ubicacion = ?, descripcion = ?, estado = ?
       WHERE id_aula = ?`,
      [
        nombre.trim(),
        ubicacion ? ubicacion.trim() : null,
        descripcion ? descripcion.trim() : null,
        estado,
        id
      ]
    );
    
    // Obtener aula actualizada
    const [updatedAula] = await pool.execute(
      'SELECT * FROM aulas WHERE id_aula = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Aula actualizada exitosamente',
      aula: updatedAula[0]
    });
    
  } catch (error) {
    console.error('Error al actualizar aula:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Ya existe otra aula con ese nombre'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// DELETE /api/aulas/:id - Eliminar aula (opcional)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar que el aula existe
    const [existingAula] = await pool.execute(
      'SELECT id_aula, nombre FROM aulas WHERE id_aula = ?',
      [id]
    );
    
    if (existingAula.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aula no encontrada'
      });
    }
    
    // TODO: Verificar si el aula está siendo usada en cursos o asignaciones
    // antes de eliminar (opcional)
    
    // Eliminar aula
    await pool.execute('DELETE FROM aulas WHERE id_aula = ?', [id]);
    
    res.json({
      success: true,
      message: `Aula "${existingAula[0].nombre}" eliminada exitosamente`
    });
    
  } catch (error) {
    console.error('Error al eliminar aula:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

module.exports = router;
