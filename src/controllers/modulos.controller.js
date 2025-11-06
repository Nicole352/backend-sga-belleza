const ModulosModel = require("../models/modulos.model");
const DocentesModel = require("../models/docentes.model");
const { registrarAuditoria } = require("../utils/auditoria");

// GET /api/modulos/curso/:id_curso - Obtener módulos de un curso
async function getModulosByCurso(req, res) {
  try {
    const { id_curso } = req.params;

    const modulos = await ModulosModel.getAllByCurso(id_curso);

    return res.json({
      success: true,
      modulos,
    });
  } catch (error) {
    console.error("Error en getModulosByCurso:", error);
    return res
      .status(500)
      .json({ error: "Error obteniendo módulos del curso" });
  }
}

// GET /api/modulos/:id - Obtener módulo por ID
async function getModuloById(req, res) {
  try {
    const { id } = req.params;

    const modulo = await ModulosModel.getById(id);

    if (!modulo) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    return res.json({
      success: true,
      modulo,
    });
  } catch (error) {
    console.error("Error en getModuloById:", error);
    return res.status(500).json({ error: "Error obteniendo módulo" });
  }
}

async function createModulo(req, res) {
  try {
    const { id_curso, nombre, descripcion, fecha_inicio, fecha_fin } = req.body;

    if (!id_curso || !nombre) {
      return res.status(400).json({ error: "Curso y nombre son obligatorios" });
    }

    const id_docente = await DocentesModel.getDocenteIdByUserId(
      req.user.id_usuario,
    );

    if (!id_docente) {
      return res.status(403).json({ error: "Usuario no es docente" });
    }

    const id_modulo = await ModulosModel.create({
      id_curso,
      id_docente,
      nombre,
      descripcion,
      fecha_inicio,
      fecha_fin,
    });

    const modulo = await ModulosModel.getById(id_modulo);

    await registrarAuditoria({
      tabla_afectada: "modulos_curso",
      operacion: "INSERT",
      id_registro: id_modulo,
      usuario_id: req.user?.id_usuario,
      datos_nuevos: req.body,
      ip_address: req.ip || "0.0.0.0",
      user_agent: req.get("user-agent") || "unknown",
    });

    // Broadcast a todos (evento general)
    const io = req.app.get('io');
    if (io) {
      io.emit('modulo_creado', {
        id_modulo,
        id_curso,
        nombre,
        modulo
      });
    }

    // Notificar a estudiantes del curso
    const { notificarNuevoModulo } = require('../utils/notificationHelper');
    
    try {
      // Obtener estudiantes matriculados en el curso
      // IMPORTANTE: id_estudiante en matriculas ES id_usuario (FK a usuarios.id_usuario)
      const { pool } = require('../config/database');
      const [estudiantes] = await pool.execute(`
        SELECT DISTINCT m.id_estudiante as id_usuario
        FROM matriculas m
        WHERE m.id_curso = ? AND m.estado = 'activa'
      `, [id_curso]);
      
      console.log(`📋 Estudiantes encontrados para el curso ${id_curso}:`, estudiantes);
      
      if (estudiantes.length > 0) {
        const idsUsuarios = estudiantes.map(e => e.id_usuario);
        
        console.log(`📤 IDs de usuarios a notificar:`, idsUsuarios);
        
        // Obtener nombre del curso
        const [cursos] = await pool.execute('SELECT nombre FROM cursos WHERE id_curso = ?', [id_curso]);
        const nombreCurso = cursos[0]?.nombre || 'tu curso';
        
        // Obtener información del docente
        const [docenteInfo] = await pool.execute(`
          SELECT u.nombre, u.apellido 
          FROM usuarios u
          WHERE u.id_usuario = ?
        `, [req.user.id_usuario]);
        
        const nombreDocente = docenteInfo[0] 
          ? `${docenteInfo[0].nombre} ${docenteInfo[0].apellido}` 
          : 'Docente';
        
        // Enviar notificación a cada estudiante
        notificarNuevoModulo(req, idsUsuarios, {
          id_modulo,
          nombre_modulo: nombre,
          curso_nombre: nombreCurso,
          id_curso,
          descripcion: descripcion || '',
          fecha_inicio: fecha_inicio || null,
          docente_nombre: nombreDocente
        });
        
        console.log(`✅ Notificaciones de nuevo módulo enviadas a ${idsUsuarios.length} estudiantes del curso ${id_curso}`);
      } else {
        console.log(`⚠️ No hay estudiantes matriculados en el curso ${id_curso}`);
      }
    } catch (notifError) {
      console.error('❌ Error enviando notificaciones de módulo:', notifError);
      // No fallar la creación del módulo si falla la notificación
    }

    return res.status(201).json({
      success: true,
      message: "Módulo creado exitosamente",
      modulo,
    });
  } catch (error) {
    console.error("Error en createModulo:", error);
    return res.status(500).json({ error: "Error creando módulo" });
  }
}

// PUT /api/modulos/:id - Actualizar módulo
async function updateModulo(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, fecha_inicio, fecha_fin, estado } = req.body;

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(
      req.user.id_usuario,
    );

    if (!id_docente) {
      return res.status(403).json({ error: "Usuario no es docente" });
    }

    // Verificar que el módulo pertenece al docente
    const belongsToDocente = await ModulosModel.belongsToDocente(
      id,
      id_docente,
    );
    if (!belongsToDocente) {
      return res
        .status(403)
        .json({ error: "No tienes permiso para modificar este módulo" });
    }

    const updated = await ModulosModel.update(id, {
      nombre,
      descripcion,
      fecha_inicio,
      fecha_fin,
      estado,
    });

    if (!updated) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    const modulo = await ModulosModel.getById(id);

    return res.json({
      success: true,
      message: "Módulo actualizado exitosamente",
      modulo,
    });
  } catch (error) {
    console.error("Error en updateModulo:", error);
    return res.status(500).json({ error: "Error actualizando módulo" });
  }
}

// PUT /api/modulos/:id/cerrar - Cerrar módulo
async function cerrarModulo(req, res) {
  try {
    const { id } = req.params;
    console.log("Intentando cerrar módulo con ID:", id);

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(
      req.user.id_usuario,
    );
    console.log("ID de docente obtenido:", id_docente);

    if (!id_docente) {
      return res.status(403).json({ error: "Usuario no es docente" });
    }

    // Verificar que el módulo pertenece al docente
    const belongsToDocente = await ModulosModel.belongsToDocente(
      id,
      id_docente,
    );
    console.log("¿El módulo pertenece al docente?", belongsToDocente);
    if (!belongsToDocente) {
      return res
        .status(403)
        .json({ error: "No tienes permiso para modificar este módulo" });
    }

    // Actualizar el estado del módulo a 'finalizado'
    const updated = await ModulosModel.update(id, {
      estado: "finalizado",
    });
    console.log("Resultado de actualización:", updated);

    if (!updated) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    const modulo = await ModulosModel.getById(id);
    console.log("Módulo actualizado:", modulo);

    return res.json({
      success: true,
      message: "Módulo cerrado exitosamente",
      modulo,
    });
  } catch (error) {
    console.error("Error en cerrarModulo:", error);
    return res
      .status(500)
      .json({ error: "Error cerrando módulo: " + error.message });
  }
}

// PUT /api/modulos/:id/reabrir - Reabrir módulo
async function reabrirModulo(req, res) {
  try {
    const { id } = req.params;
    console.log("Intentando reabrir módulo con ID:", id);

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(
      req.user.id_usuario,
    );
    console.log("ID de docente obtenido:", id_docente);

    if (!id_docente) {
      return res.status(403).json({ error: "Usuario no es docente" });
    }

    // Verificar que el módulo pertenece al docente
    const belongsToDocente = await ModulosModel.belongsToDocente(
      id,
      id_docente,
    );
    console.log("¿El módulo pertenece al docente?", belongsToDocente);
    if (!belongsToDocente) {
      return res
        .status(403)
        .json({ error: "No tienes permiso para modificar este módulo" });
    }

    // Actualizar el estado del módulo a 'activo'
    const updated = await ModulosModel.update(id, {
      estado: "activo",
    });
    console.log("Resultado de actualización:", updated);

    if (!updated) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    const modulo = await ModulosModel.getById(id);
    console.log("Módulo actualizado:", modulo);

    return res.json({
      success: true,
      message: "Módulo reabierto exitosamente",
      modulo,
    });
  } catch (error) {
    console.error("Error en reabrirModulo:", error);
    return res
      .status(500)
      .json({ error: "Error reabriendo módulo: " + error.message });
  }
}

// DELETE /api/modulos/:id - Eliminar módulo
async function deleteModulo(req, res) {
  try {
    const { id } = req.params;

    // Obtener id_docente del usuario autenticado
    const id_docente = await DocentesModel.getDocenteIdByUserId(
      req.user.id_usuario,
    );

    if (!id_docente) {
      return res.status(403).json({ error: "Usuario no es docente" });
    }

    // Verificar que el módulo pertenece al docente
    const belongsToDocente = await ModulosModel.belongsToDocente(
      id,
      id_docente,
    );
    if (!belongsToDocente) {
      return res
        .status(403)
        .json({ error: "No tienes permiso para eliminar este módulo" });
    }

    const deleted = await ModulosModel.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    return res.json({
      success: true,
      message: "Módulo eliminado exitosamente",
    });
  } catch (error) {
    console.error("Error en deleteModulo:", error);
    return res.status(500).json({ error: "Error eliminando módulo" });
  }
}

// GET /api/modulos/:id/stats - Obtener estadísticas del módulo
async function getModuloStats(req, res) {
  try {
    const { id } = req.params;

    const stats = await ModulosModel.getStats(id);

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Error en getModuloStats:", error);
    return res.status(500).json({ error: "Error obteniendo estadísticas" });
  }
}

// GET /api/modulos/:id/promedio-ponderado/:id_estudiante - Obtener promedio ponderado de un estudiante
async function getPromedioPonderado(req, res) {
  try {
    const { id, id_estudiante } = req.params;

    const promedio = await ModulosModel.getPromedioPonderado(id, id_estudiante);

    return res.json({
      success: true,
      promedio,
    });
  } catch (error) {
    console.error("Error en getPromedioPonderado:", error);
    return res
      .status(500)
      .json({ error: "Error obteniendo promedio ponderado" });
  }
}

// GET /api/modulos/:id/promedios-ponderados - Obtener promedios de todos los estudiantes
async function getPromediosPonderados(req, res) {
  try {
    const { id } = req.params;

    const promedios = await ModulosModel.getPromediosPonderadosPorModulo(id);

    return res.json({
      success: true,
      promedios,
    });
  } catch (error) {
    console.error("Error en getPromediosPonderados:", error);
    return res
      .status(500)
      .json({ error: "Error obteniendo promedios ponderados" });
  }
}

// PUT /api/modulos/:id/publicar-promedios - Publicar promedios del módulo
async function publicarPromedios(req, res) {
  try {
    const { id } = req.params;

    const updated = await ModulosModel.publicarPromedios(id);

    if (!updated) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    return res.json({
      success: true,
      message: "Promedios publicados exitosamente",
    });
  } catch (error) {
    console.error("Error en publicarPromedios:", error);
    return res.status(500).json({ error: "Error publicando promedios" });
  }
}

// PUT /api/modulos/:id/ocultar-promedios - Ocultar promedios del módulo
async function ocultarPromedios(req, res) {
  try {
    const { id } = req.params;

    const updated = await ModulosModel.ocultarPromedios(id);

    if (!updated) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    return res.json({
      success: true,
      message: "Promedios ocultados exitosamente",
    });
  } catch (error) {
    console.error("Error en ocultarPromedios:", error);
    return res.status(500).json({ error: "Error ocultando promedios" });
  }
}

module.exports = {
  getModulosByCurso,
  getModuloById,
  createModulo,
  updateModulo,
  deleteModulo,
  getModuloStats,
  cerrarModulo,
  reabrirModulo,
  getPromedioPonderado,
  getPromediosPonderados,
  publicarPromedios,
  ocultarPromedios
};
