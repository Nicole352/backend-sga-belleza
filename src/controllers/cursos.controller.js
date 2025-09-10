const {
  getAllCursos,
  getCursoById,
  createCurso,
  updateCurso,
  deleteCurso,
  getTiposCursos,
  getAulasDisponibles,
  asignarDocente,
  desasignarDocente,
  getDocentesPorCurso,
  getEstadisticasCursos
} = require('../models/cursos.model');

// GET /api/cursos - Listar cursos con filtros
async function listCursosController(req, res) {
  try {
    const { estado, tipo, page, limit } = req.query;
    
    const filters = {
      estado: estado || 'todos',
      tipo: tipo ? Number(tipo) : undefined,
      page: Math.max(1, Number(page) || 1),
      limit: Math.max(1, Math.min(100, Number(limit) || 10))
    };

    const cursos = await getAllCursos(filters);
    
    // Formatear fechas para el frontend
    const cursosFormateados = cursos.map(curso => ({
      ...curso,
      fecha_inicio: curso.fecha_inicio ? new Date(curso.fecha_inicio).toISOString().split('T')[0] : null,
      fecha_fin: curso.fecha_fin ? new Date(curso.fecha_fin).toISOString().split('T')[0] : null,
      estudiantes_inscritos: Number(curso.estudiantes_inscritos) || 0,
      docentes_asignados: Number(curso.docentes_asignados) || 0,
      progreso: calcularProgresoCurso(curso.fecha_inicio, curso.fecha_fin),
      disponibilidad: ((curso.capacidad_maxima - curso.estudiantes_inscritos) / curso.capacidad_maxima * 100).toFixed(1)
    }));

    return res.json({
      success: true,
      data: cursosFormateados,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: cursosFormateados.length
      }
    });
  } catch (err) {
    console.error('Error listando cursos:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Error al listar cursos',
      message: err.message 
    });
  }
}

// GET /api/cursos/:id - Obtener curso específico
async function getCursoController(req, res) {
  try {
    const id = Number(req.params.id);
    
    if (!id || id <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'ID de curso inválido' 
      });
    }

    const curso = await getCursoById(id);
    
    if (!curso) {
      return res.status(404).json({ 
        success: false,
        error: 'Curso no encontrado' 
      });
    }

    // Obtener docentes asignados
    const docentes = await getDocentesPorCurso(id);

    const cursoCompleto = {
      ...curso,
      fecha_inicio: curso.fecha_inicio ? new Date(curso.fecha_inicio).toISOString().split('T')[0] : null,
      fecha_fin: curso.fecha_fin ? new Date(curso.fecha_fin).toISOString().split('T')[0] : null,
      docentes_asignados: docentes,
      progreso: calcularProgresoCurso(curso.fecha_inicio, curso.fecha_fin)
    };

    return res.json({
      success: true,
      data: cursoCompleto
    });
  } catch (err) {
    console.error('Error obteniendo curso:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Error al obtener el curso',
      message: err.message 
    });
  }
}

// POST /api/cursos - Crear nuevo curso
async function createCursoController(req, res) {
  try {
    const {
      codigo_curso,
      id_tipo_curso,
      id_aula,
      nombre,
      descripcion,
      capacidad_maxima,
      fecha_inicio,
      fecha_fin,
      horario,
      estado
    } = req.body;

    // Validaciones básicas
    if (!codigo_curso || !nombre || !id_tipo_curso || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({
        success: false,
        error: 'Campos obligatorios faltantes',
        required: ['codigo_curso', 'nombre', 'id_tipo_curso', 'fecha_inicio', 'fecha_fin']
      });
    }

    // Validar fechas
    const fechaInicio = new Date(fecha_inicio);
    const fechaFin = new Date(fecha_fin);
    
    if (fechaFin <= fechaInicio) {
      return res.status(400).json({
        success: false,
        error: 'La fecha de fin debe ser posterior a la fecha de inicio'
      });
    }

    // Validar capacidad
    const capacidad = Number(capacidad_maxima) || 20;
    if (capacidad <= 0 || capacidad > 100) {
      return res.status(400).json({
        success: false,
        error: 'La capacidad debe estar entre 1 y 100 estudiantes'
      });
    }

    const cursoData = {
      codigo_curso: codigo_curso.trim().toUpperCase(),
      id_tipo_curso: Number(id_tipo_curso),
      id_aula: id_aula ? Number(id_aula) : null,
      nombre: nombre.trim(),
      descripcion: descripcion ? descripcion.trim() : null,
      capacidad_maxima: capacidad,
      fecha_inicio,
      fecha_fin,
      horario: horario ? horario.trim() : null,
      estado: estado || 'planificado'
    };

    const nuevoCurso = await createCurso(cursoData);

    return res.status(201).json({
      success: true,
      message: 'Curso creado exitosamente',
      data: {
        ...nuevoCurso,
        fecha_inicio: nuevoCurso.fecha_inicio ? new Date(nuevoCurso.fecha_inicio).toISOString().split('T')[0] : null,
        fecha_fin: nuevoCurso.fecha_fin ? new Date(nuevoCurso.fecha_fin).toISOString().split('T')[0] : null
      }
    });
  } catch (err) {
    console.error('Error creando curso:', err);
    
    // Manejar errores específicos de BD
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: 'El código del curso ya existe'
      });
    }
    
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({
        success: false,
        error: 'Tipo de curso o aula no válidos'
      });
    }

    return res.status(500).json({ 
      success: false,
      error: 'Error al crear el curso',
      message: err.message 
    });
  }
}

// PUT /api/cursos/:id - Actualizar curso
async function updateCursoController(req, res) {
  try {
    const id = Number(req.params.id);
    
    if (!id || id <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'ID de curso inválido' 
      });
    }

    // Verificar que el curso existe
    const cursoExistente = await getCursoById(id);
    if (!cursoExistente) {
      return res.status(404).json({ 
        success: false,
        error: 'Curso no encontrado' 
      });
    }

    const cursoData = { ...req.body };
    
    // Limpiar y validar datos
    if (cursoData.codigo_curso) {
      cursoData.codigo_curso = cursoData.codigo_curso.trim().toUpperCase();
    }
    
    if (cursoData.nombre) {
      cursoData.nombre = cursoData.nombre.trim();
    }
    
    if (cursoData.descripcion) {
      cursoData.descripcion = cursoData.descripcion.trim();
    }

    // Validar fechas si se proporcionan
    if (cursoData.fecha_inicio && cursoData.fecha_fin) {
      const fechaInicio = new Date(cursoData.fecha_inicio);
      const fechaFin = new Date(cursoData.fecha_fin);
      
      if (fechaFin <= fechaInicio) {
        return res.status(400).json({
          success: false,
          error: 'La fecha de fin debe ser posterior a la fecha de inicio'
        });
      }
    }

    // Validar capacidad si se proporciona
    if (cursoData.capacidad_maxima !== undefined) {
      const capacidad = Number(cursoData.capacidad_maxima);
      if (capacidad <= 0 || capacidad > 100) {
        return res.status(400).json({
          success: false,
          error: 'La capacidad debe estar entre 1 y 100 estudiantes'
        });
      }
      cursoData.capacidad_maxima = capacidad;
    }

    const cursoActualizado = await updateCurso(id, cursoData);

    return res.json({
      success: true,
      message: 'Curso actualizado exitosamente',
      data: {
        ...cursoActualizado,
        fecha_inicio: cursoActualizado.fecha_inicio ? new Date(cursoActualizado.fecha_inicio).toISOString().split('T')[0] : null,
        fecha_fin: cursoActualizado.fecha_fin ? new Date(cursoActualizado.fecha_fin).toISOString().split('T')[0] : null
      }
    });
  } catch (err) {
    console.error('Error actualizando curso:', err);
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: 'El código del curso ya existe'
      });
    }

    return res.status(500).json({ 
      success: false,
      error: 'Error al actualizar el curso',
      message: err.message 
    });
  }
}

// DELETE /api/cursos/:id - Eliminar curso
async function deleteCursoController(req, res) {
  try {
    const id = Number(req.params.id);
    
    if (!id || id <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'ID de curso inválido' 
      });
    }

    const eliminado = await deleteCurso(id);
    
    if (!eliminado) {
      return res.status(404).json({ 
        success: false,
        error: 'Curso no encontrado' 
      });
    }

    return res.json({
      success: true,
      message: 'Curso eliminado exitosamente'
    });
  } catch (err) {
    console.error('Error eliminando curso:', err);
    
    // Manejar restricciones de FK
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        success: false,
        error: 'No se puede eliminar el curso porque tiene estudiantes matriculados o docentes asignados'
      });
    }

    return res.status(500).json({ 
      success: false,
      error: 'Error al eliminar el curso',
      message: err.message 
    });
  }
}

// GET /api/cursos/tipos - Obtener tipos de cursos
async function getTiposCursosController(req, res) {
  try {
    const tipos = await getTiposCursos();
    
    return res.json({
      success: true,
      data: tipos
    });
  } catch (err) {
    console.error('Error obteniendo tipos de cursos:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Error al obtener tipos de cursos',
      message: err.message 
    });
  }
}

// GET /api/cursos/aulas - Obtener aulas disponibles
async function getAulasController(req, res) {
  try {
    const aulas = await getAulasDisponibles();
    
    return res.json({
      success: true,
      data: aulas
    });
  } catch (err) {
    console.error('Error obteniendo aulas:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Error al obtener aulas',
      message: err.message 
    });
  }
}

// POST /api/cursos/:id/docentes - Asignar docente
async function asignarDocenteController(req, res) {
  try {
    const id_curso = Number(req.params.id);
    const { id_docente } = req.body;
    
    if (!id_curso || !id_docente) {
      return res.status(400).json({
        success: false,
        error: 'ID de curso y docente son obligatorios'
      });
    }

    const asignado = await asignarDocente(id_curso, Number(id_docente));
    
    if (!asignado) {
      return res.status(400).json({
        success: false,
        error: 'No se pudo asignar el docente'
      });
    }

    return res.json({
      success: true,
      message: 'Docente asignado exitosamente'
    });
  } catch (err) {
    console.error('Error asignando docente:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Error al asignar docente',
      message: err.message 
    });
  }
}

// DELETE /api/cursos/:id/docentes/:docente_id - Desasignar docente
async function desasignarDocenteController(req, res) {
  try {
    const id_curso = Number(req.params.id);
    const id_docente = Number(req.params.docente_id);
    
    if (!id_curso || !id_docente) {
      return res.status(400).json({
        success: false,
        error: 'ID de curso y docente son obligatorios'
      });
    }

    const desasignado = await desasignarDocente(id_curso, id_docente);
    
    if (!desasignado) {
      return res.status(400).json({
        success: false,
        error: 'No se pudo desasignar el docente'
      });
    }

    return res.json({
      success: true,
      message: 'Docente desasignado exitosamente'
    });
  } catch (err) {
    console.error('Error desasignando docente:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Error al desasignar docente',
      message: err.message 
    });
  }
}

// GET /api/cursos/estadisticas - Obtener estadísticas
async function getEstadisticasController(req, res) {
  try {
    const estadisticas = await getEstadisticasCursos();
    
    return res.json({
      success: true,
      data: estadisticas
    });
  } catch (err) {
    console.error('Error obteniendo estadísticas:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Error al obtener estadísticas',
      message: err.message 
    });
  }
}

// Función auxiliar para calcular progreso del curso
function calcularProgresoCurso(fecha_inicio, fecha_fin) {
  if (!fecha_inicio || !fecha_fin) return 0;
  
  const inicio = new Date(fecha_inicio);
  const fin = new Date(fecha_fin);
  const ahora = new Date();
  
  if (ahora < inicio) return 0;
  if (ahora > fin) return 100;
  
  const totalDias = fin - inicio;
  const diasTranscurridos = ahora - inicio;
  
  return Math.round((diasTranscurridos / totalDias) * 100);
}

module.exports = {
  listCursosController,
  getCursoController,
  createCursoController,
  updateCursoController,
  deleteCursoController,
  getTiposCursosController,
  getAulasController,
  asignarDocenteController,
  desasignarDocenteController,
  getEstadisticasController
};