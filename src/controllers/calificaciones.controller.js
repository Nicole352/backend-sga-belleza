const ExcelJS = require('exceljs');
const CalificacionesModel = require("../models/calificaciones.model");

// ... (existing code)

// GET /api/calificaciones/reporte-estudiante/:id_curso - Generar Excel de notas para estudiante
async function generarReporteNotasEstudiante(req, res) {
  try {
    const { id_curso } = req.params;
    const { id_usuario: id_estudiante } = req.user;
    const { pool } = require("../config/database");

    // 1. Obtener información del curso y del estudiante por separado para asegurar datos reales
    const [cursoInfo] = await pool.execute(
      `SELECT c.nombre as nombre_curso, c.codigo_curso, c.horario
       FROM cursos c 
       WHERE c.id_curso = ?`,
      [id_curso]
    );

    // 1.1 Obtener información del docente y horario de clases (asignación)
    const [asignacionInfo] = await pool.execute(
      `SELECT d.nombres, d.apellidos, aa.hora_inicio, aa.hora_fin
       FROM asignaciones_aulas aa
       INNER JOIN docentes d ON aa.id_docente = d.id_docente
       WHERE aa.id_curso = ? AND aa.estado = 'activa'
       LIMIT 1`,
      [id_curso]
    );

    const [estudianteInfo] = await pool.execute(
      `SELECT id_usuario, nombre, apellido, cedula 
       FROM usuarios 
       WHERE id_usuario = ?`,
      [id_estudiante]
    );

    if (cursoInfo.length === 0) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    if (estudianteInfo.length === 0) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }

    const curso = cursoInfo[0];
    const estudiante = estudianteInfo[0];

    // 2. Obtener desglose de notas y promedios
    const todasLasNotas = await CalificacionesModel.getByEstudianteCurso(id_estudiante, id_curso);
    const desgloseModulos = await CalificacionesModel.getDesglosePorModulos(id_estudiante, id_curso);
    const promedioData = await CalificacionesModel.getPromedioGlobalBalanceado(id_estudiante, id_curso);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Notas', {
      pageSetup: {
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.6, header: 0.1, footer: 0.2 },
        printTitlesRow: '1:5'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Encabezado
    sheet.mergeCells('A1:F1');
    const cellTitle = sheet.getCell('A1');
    cellTitle.value = `REPORTE DE CALIFICACIONES - ${(curso.nombre_curso || '').toUpperCase()}`;
    cellTitle.font = { bold: true, size: 12, name: 'Calibri' };
    cellTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 25;

    sheet.mergeCells('A2:F2');
    const cellInfo = sheet.getCell('A2');
    cellInfo.value = `ESTUDIANTE: ${estudiante.apellido.toUpperCase()} ${estudiante.nombre.toUpperCase()} | ID: ${estudiante.cedula}`;
    cellInfo.font = { size: 10, name: 'Calibri' };
    cellInfo.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 25;

    // Info Docente y Horario (Fila 3)
    const asignacion = asignacionInfo.length > 0 ? asignacionInfo[0] : {};
    const docenteNombre = asignacion.nombres ? `${asignacion.apellidos} ${asignacion.nombres}` : 'NO ASIGNADO';
    const horaInicio = asignacion.hora_inicio ? asignacion.hora_inicio.substring(0, 5) : '--:--';
    const horaFin = asignacion.hora_fin ? asignacion.hora_fin.substring(0, 5) : '--:--';
    const horarioCurso = curso.horario ? curso.horario.toUpperCase() : 'N/A';

    sheet.mergeCells('A3:F3');
    const cellDocente = sheet.getCell('A3');
    cellDocente.value = `DOCENTE: ${docenteNombre.toUpperCase()} | HORARIO: ${horarioCurso} | HORA: ${horaInicio} - ${horaFin}`;
    cellDocente.font = { size: 10, name: 'Calibri' };
    cellDocente.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(3).height = 25;

    // Table Headers (Fila 5)
    const headers = ['#', 'MÓDULO', 'CATEGORÍA', 'TAREA', 'NOTA', 'PONDERACIÓN'];
    const headerRow = sheet.getRow(5);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h.toUpperCase();
      cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF000000' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    headerRow.height = 25;

    // Configizar columnas
    sheet.columns = [
      { width: 5 },  // #
      { width: 22 }, // Módulo
      { width: 22 }, // Categoría
      { width: 45 }, // Tarea
      { width: 10 }, // Nota
      { width: 14 }  // Ponderación
    ];

    // Datos por Módulo
    const modulosAgrupados = {};
    todasLasNotas.forEach(nota => {
      if (!modulosAgrupados[nota.modulo_nombre]) modulosAgrupados[nota.modulo_nombre] = [];
      modulosAgrupados[nota.modulo_nombre].push(nota);
    });

    let modCounter = 1;
    Object.keys(modulosAgrupados).forEach(moduloNombre => {
      const tareas = modulosAgrupados[moduloNombre];
      const startRowModulo = sheet.lastRow.number + 1;

      // Agrupar por categoría dentro del módulo
      const categoriasDeModulo = {};
      tareas.forEach(t => {
        const cat = t.categoria_nombre || "SIN CATEGORÍA";
        if (!categoriasDeModulo[cat]) categoriasDeModulo[cat] = [];
        categoriasDeModulo[cat].push(t);
      });

      Object.keys(categoriasDeModulo).forEach(catNombre => {
        const tareasCat = categoriasDeModulo[catNombre];
        const startRowCat = sheet.lastRow.number + 1;
        const catPond = tareasCat[0].categoria_ponderacion || 0;

        tareasCat.forEach((t) => {
          const numTareasCat = tareasCat.length;
          const valorTarea = numTareasCat > 0 ? (catPond / numTareasCat) : 0;

          const row = sheet.addRow([
            modCounter,
            moduloNombre.toUpperCase(),
            catNombre.toUpperCase(),
            t.tarea_titulo.toUpperCase(),
            t.nota !== null ? parseFloat(t.nota) : "-",
            valorTarea.toFixed(2)
          ]);

          row.eachCell((cell, colNum) => {
            cell.font = { size: 10, name: 'Calibri' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            // Formatos específicos
            if (colNum === 1) {
              cell.numFmt = '0'; // Índice
            } else if (colNum === 5 || colNum === 6) {
              cell.numFmt = '0.00'; // Nota y Ponderación
            } else {
              cell.numFmt = '@'; // Texto
            }

            // Alineación
            cell.alignment = {
              horizontal: (colNum === 1 || colNum >= 5) ? 'center' : 'left',
              vertical: 'middle',
              wrapText: true
            };
          });
        });

        // Merging para Categoría si tiene más de una tarea
        if (tareasCat.length > 1) {
          sheet.mergeCells(startRowCat, 3, sheet.lastRow.number, 3);
        }
      });

      // Merging para Módulo e Índice se tiene más de una tarea
      if (tareas.length > 1) {
        sheet.mergeCells(startRowModulo, 1, sheet.lastRow.number, 1);
        sheet.mergeCells(startRowModulo, 2, sheet.lastRow.number, 2);
      }

      // Fila de Promedio del Módulo
      const modInfo = desgloseModulos.find(m => m.nombre_modulo === moduloNombre);
      const promMod = modInfo ? parseFloat(modInfo.promedio_modulo_sobre_10) : 0;

      const subTotalRow = sheet.addRow([
        `PROMEDIO ${moduloNombre.toUpperCase()}`,
        '',
        '',
        '',
        promMod,
        ''
      ]);
      sheet.mergeCells(subTotalRow.number, 1, subTotalRow.number, 4);

      subTotalRow.eachCell((cell, colNum) => {
        cell.font = { bold: true, size: 10, name: 'Calibri' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        if (colNum === 1) {
          cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
          cell.numFmt = '@';
        } else if (colNum === 5) {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.numFmt = '0.00';
        } else {
          cell.numFmt = '@';
        }
      });

      modCounter++;
    });

    // Fila de Promedio Global Final
    const promGlobal = parseFloat(promedioData.promedio_global);
    const finalRow = sheet.addRow([
      'PROMEDIO GLOBAL FINAL',
      '',
      '',
      '',
      promGlobal,
      ''
    ]);
    sheet.mergeCells(finalRow.number, 1, finalRow.number, 4);

    finalRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, size: 11, name: 'Calibri' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      if (colNum === 1) {
        cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
        cell.numFmt = '@';
      } else if (colNum === 5) {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.numFmt = '0.00';
      } else {
        cell.numFmt = '@';
      }
    });

    // Response

    // Response
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Notas_${estudiante.apellido.toUpperCase()}${estudiante.nombre.toUpperCase()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error al generar reporte de notas:", error);
    res.status(500).json({ error: "Error interno al generar el reporte" });
  }
}

// GET /api/calificaciones/estudiante/curso/:id_curso - Obtener calificaciones de un estudiante en un curso
async function getCalificacionesByEstudianteCurso(req, res) {
  try {
    const id_curso = req.params.id_curso || req.params.id; // Support both param names if needed
    const id_estudiante = req.user.id_usuario;

    // 1. Obtener calificaciones raw
    const calificaciones = await CalificacionesModel.getByEstudianteCurso(
      id_estudiante,
      id_curso,
    );

    // 2. Obtener desglose por módulos y promedio global (¡Ya calculado en Backend!)
    const desglose = await CalificacionesModel.getDesglosePorModulos(
      id_estudiante,
      id_curso
    );

    const promedioData = await CalificacionesModel.getPromedioGlobalBalanceado(
      id_estudiante,
      id_curso
    );

    // 3. Estructurar respuesta completa
    return res.json({
      success: true,
      calificaciones, // Lista cruda de tareas
      resumen: {
        promedio_global: promedioData.promedio_global || 0,
        peso_por_modulo: promedioData.peso_por_modulo,
        total_modulos: promedioData.total_modulos,
        desglose_modulos: desglose // Detalles por módulo ya calculados
      }
    });
  } catch (error) {
    console.error("Error en getCalificacionesByEstudianteCurso:", error);
    return res.status(500).json({ error: "Error obteniendo calificaciones" });
  }
}

// GET /api/calificaciones/promedio/modulo/:id_modulo - Obtener promedio de un módulo
async function getPromedioModulo(req, res) {
  try {
    const { id_modulo } = req.params;
    const id_estudiante = req.user.id_usuario;

    const promedio = await CalificacionesModel.getPromedioModulo(
      id_estudiante,
      id_modulo,
    );

    return res.json({
      success: true,
      promedio,
    });
  } catch (error) {
    console.error("Error en getPromedioModulo:", error);
    return res.status(500).json({ error: "Error obteniendo promedio" });
  }
}

// GET /api/calificaciones/promedio/curso/:id_curso - Obtener promedio general del curso
async function getPromedioCurso(req, res) {
  try {
    const { id_curso } = req.params;
    const id_estudiante = req.user.id_usuario;

    const promedio = await CalificacionesModel.getPromedioCurso(
      id_estudiante,
      id_curso,
    );

    return res.json({
      success: true,
      promedio,
    });
  } catch (error) {
    console.error("Error en getPromedioCurso:", error);
    return res.status(500).json({ error: "Error obteniendo promedio" });
  }
}

// GET /api/calificaciones/promedio-global/:id_curso - Obtener promedio global balanceado sobre 10 puntos
async function getPromedioGlobalBalanceado(req, res) {
  try {
    const { id_curso } = req.params;
    const id_estudiante = req.user.id_usuario;
    const { pool } = require("../config/database");

    // Verificar si TODOS los módulos tienen promedios publicados
    const [modulosCheck] = await pool.execute(
      `SELECT COUNT(*) as total_modulos,
              SUM(CASE WHEN promedios_publicados = TRUE THEN 1 ELSE 0 END) as modulos_publicados
       FROM modulos_curso
       WHERE id_curso = ?`,
      [id_curso],
    );

    const todosPublicados =
      modulosCheck[0].total_modulos > 0 &&
      modulosCheck[0].total_modulos === modulosCheck[0].modulos_publicados;

    // Si NO todos los módulos están publicados, no mostrar promedio global
    if (!todosPublicados) {
      return res.json({
        success: true,
        promedio_global: null,
        visible: false,
        mensaje:
          "El promedio global estará disponible cuando todos los módulos tengan sus promedios publicados",
      });
    }

    const promedioGlobal =
      await CalificacionesModel.getPromedioGlobalBalanceado(
        id_estudiante,
        id_curso,
      );

    return res.json({
      success: true,
      promedio_global: promedioGlobal,
      visible: true,
      descripcion:
        "Promedio global sobre 10 puntos. Cada módulo aporta proporcionalmente según la cantidad total de módulos.",
    });
  } catch (error) {
    console.error("Error en getPromedioGlobalBalanceado:", error);
    return res.status(500).json({
      success: false,
      error: "Error obteniendo promedio global balanceado",
    });
  }
}

// GET /api/calificaciones/desglose-modulos/:id_curso - Obtener desglose detallado por módulos
async function getDesglosePorModulos(req, res) {
  try {
    const { id_curso } = req.params;
    const id_estudiante = req.user.id_usuario;

    const desglose = await CalificacionesModel.getDesglosePorModulos(
      id_estudiante,
      id_curso,
    );
    const promedioGlobal =
      await CalificacionesModel.getPromedioGlobalBalanceado(
        id_estudiante,
        id_curso,
      );

    return res.json({
      success: true,
      desglose_por_modulos: desglose,
      promedio_global_balanceado: promedioGlobal,
      resumen: {
        total_modulos: desglose.length,
        modulos_con_calificaciones: desglose.filter(
          (m) => m.total_calificaciones > 0,
        ).length,
        modulos_aprobados: desglose.filter(
          (m) => parseFloat(m.promedio_modulo_sobre_10) >= 7,
        ).length,
        modulos_reprobados: desglose.filter(
          (m) => parseFloat(m.promedio_modulo_sobre_10) < 7,
        ).length,
        peso_por_modulo: promedioGlobal.peso_por_modulo,
        estado_general:
          parseFloat(promedioGlobal.promedio_global) >= 7
            ? "APROBADO"
            : "REPROBADO",
      },
    });
  } catch (error) {
    console.error("Error en getDesglosePorModulos:", error);
    return res.status(500).json({
      success: false,
      error: "Error obteniendo desglose por módulos",
    });
  }
}

// GET /api/calificaciones/entrega/:id_entrega - Obtener calificación de una entrega
async function getCalificacionByEntrega(req, res) {
  try {
    const { id_entrega } = req.params;

    const calificacion = await CalificacionesModel.getByEntrega(id_entrega);

    return res.json({
      success: true,
      calificacion,
    });
  } catch (error) {
    console.error("Error en getCalificacionByEntrega:", error);
    return res.status(500).json({ error: "Error obteniendo calificación" });
  }
}

// GET /api/calificaciones/curso/:id_curso/completo - Obtener calificaciones completas con promedios por módulo y global
async function getCalificacionesCompletasCurso(req, res) {
  try {
    const { id_curso } = req.params;
    const { pool } = require("../config/database");

    // Obtener todos los estudiantes del curso directamente de la BD
    const [estudiantes] = await pool.execute(
      `SELECT
        u.id_usuario as id_estudiante,
        u.nombre,
        u.apellido,
        u.email
      FROM usuarios u
      INNER JOIN roles r ON u.id_rol = r.id_rol
      INNER JOIN matriculas m ON u.id_usuario = m.id_estudiante
      WHERE m.id_curso = ?
        AND r.nombre_rol = 'estudiante'
        AND m.estado = 'activa'
      ORDER BY u.apellido, u.nombre`,
      [id_curso],
    );

    // Obtener todos los módulos del curso
    const [modulos] = await pool.execute(
      `SELECT id_modulo, nombre as nombre_modulo
      FROM modulos_curso
      WHERE id_curso = ?
      ORDER BY id_modulo ASC`,
      [id_curso],
    );

    // Para cada estudiante, obtener su desglose y promedio global
    const estudiantesConPromedios = [];

    for (const estudiante of estudiantes) {
      try {
        const desglose = await CalificacionesModel.getDesglosePorModulos(
          estudiante.id_estudiante,
          id_curso,
        );

        const promedioGlobal =
          await CalificacionesModel.getPromedioGlobalBalanceado(
            estudiante.id_estudiante,
            id_curso,
          );

        // Construir objeto de promedios por módulo
        const promediosModulos = {};
        desglose.forEach((modulo) => {
          if (modulo.aporte_al_promedio_global !== null) {
            promediosModulos[modulo.nombre_modulo] = parseFloat(
              modulo.aporte_al_promedio_global,
            );
          }
        });

        estudiantesConPromedios.push({
          id_estudiante: estudiante.id_estudiante,
          nombre: estudiante.nombre,
          apellido: estudiante.apellido,
          email: estudiante.email,
          promedio_global: promedioGlobal.promedio_global || 0,
          peso_por_modulo: promedioGlobal.peso_por_modulo || 0,
          total_modulos: promedioGlobal.total_modulos || 0,
          promedios_modulos: promediosModulos,
          modulos_detalle: desglose,
        });
      } catch (error) {
        console.error(
          `Error obteniendo promedios para estudiante ${estudiante.id_estudiante}:`,
          error,
        );
        // Agregar estudiante sin promedios si hay error
        estudiantesConPromedios.push({
          id_estudiante: estudiante.id_estudiante,
          nombre: estudiante.nombre,
          apellido: estudiante.apellido,
          email: estudiante.email,
          promedio_global: 0,
          peso_por_modulo: 0,
          total_modulos: 0,
          promedios_modulos: {},
          modulos_detalle: [],
        });
      }
    }

    // Obtener nombres de módulos ordenados
    const modulosNombres = modulos.map((m) => m.nombre_modulo);

    return res.json({
      success: true,
      estudiantes: estudiantesConPromedios,
      modulos: modulosNombres,
      peso_por_modulo:
        estudiantesConPromedios.length > 0
          ? estudiantesConPromedios[0].peso_por_modulo
          : 0,
    });
  } catch (error) {
    console.error("Error en getCalificacionesCompletasCurso:", error);
    return res.status(500).json({
      success: false,
      error: "Error obteniendo calificaciones completas del curso",
    });
  }
}

module.exports = {
  getCalificacionesByEstudianteCurso,
  getPromedioModulo,
  getPromedioCurso,
  getPromedioGlobalBalanceado,
  getDesglosePorModulos,
  getCalificacionByEntrega,
  getCalificacionesCompletasCurso,
  generarReporteNotasEstudiante
};
