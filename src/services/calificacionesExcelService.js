const ExcelJS = require('exceljs');

const generarExcelCalificacionesCurso = async (data) => {
    try {
        const {
            cursoNombre,
            cursoActual, // { horario, hora_inicio, hora_fin }
            nombreDocente,
            tareas, // Array of Tareas
            estudiantes, // Array of Estudiantes (with .calificaciones mapped)
            modulos, // Array of strings (module names)
        } = data;

        const workbook = new ExcelJS.Workbook();

        // Configurar metadatos del archivo
        workbook.creator = 'SGA Belleza';
        workbook.created = new Date();
        workbook.lastModifiedBy = 'SGA Belleza';

        const standardFooter = {
            oddFooter: `&L&"-,Bold"&14Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
        };

        // Función auxiliar para ajustar ancho de columnas automáticamente
        const ajustarAnchoColumnas = (worksheet, customOptions = {}) => {
            worksheet.columns.forEach((column, colIdx) => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, (cell, rowIdx) => {
                    // Ignorar filas 1 y 2 (títulos dinámicos merged)
                    if (rowIdx <= 2) return;

                    const cellValue = cell.value ? cell.value.toString() : "";
                    let currentLen = cellValue.length;

                    // Si es un header y muy largo, limitamos para wrapText
                    if (rowIdx >= 4 && rowIdx <= 6) {
                        if (currentLen > 15) currentLen = 15;
                    }

                    if (currentLen > maxLength) maxLength = currentLen;
                });

                let finalWidth = maxLength + 3;

                // Ajustes específicos
                if (worksheet.name === 'Estadísticas') {
                    if (colIdx === 0) finalWidth = 40;
                    else finalWidth = 15;
                } else {
                    // Columna # (índice 0)
                    if (colIdx === 0) finalWidth = 6;
                    // Identificación, Apellido, Nombre
                    else if (colIdx === 1 || colIdx === 2 || colIdx === 3) {
                        const limit = customOptions.maxNameWidth || 30;
                        if (finalWidth > limit) finalWidth = limit;
                        if (finalWidth < 18) finalWidth = 18;
                    }
                    // Columnas de datos/módulos
                    else {
                        const limit = customOptions.maxModuleWidth || 15;
                        if (finalWidth > limit) finalWidth = limit;
                        if (finalWidth < 12) finalWidth = 12;
                    }
                }
                column.width = finalWidth;
            });
        };

        // ============================================
        // Hoja 1: Calificaciones por Tarea
        // ============================================
        const wsDetalle = workbook.addWorksheet('Calificaciones por Tarea', {
            pageSetup: {
                paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 }
            },
            headerFooter: standardFooter
        });

        // Insertar 3 filas para encabezados
        wsDetalle.spliceRows(1, 0, [], [], []);

        wsDetalle.getRow(1).height = 25;
        wsDetalle.getRow(2).height = 35;

        // 1. Preparar datos
        const tareasPorModulo = {};
        tareas.forEach((tarea) => {
            const moduloNombre = tarea.modulo_nombre || "Sin Módulo";
            if (!tareasPorModulo[moduloNombre]) tareasPorModulo[moduloNombre] = [];
            tareasPorModulo[moduloNombre].push(tarea);
        });

        // Ordenar tareas dentro de cada módulo por orden de creación (id_tarea)
        // Esto coincide con el orden mostrado en la interfaz web
        Object.keys(tareasPorModulo).forEach(modulo => {
            tareasPorModulo[modulo].sort((a, b) => {
                return a.id_tarea - b.id_tarea;
            });
        });

        // Filas de encabezados
        const row1 = wsDetalle.addRow(['#', 'IDENTIFICACIÓN', 'APELLIDO', 'NOMBRE']);
        const row2 = wsDetalle.addRow(['', '', '', '']);
        const row3 = wsDetalle.addRow(['', '', '', '']);

        wsDetalle.mergeCells(4, 1, 6, 1); // #
        wsDetalle.mergeCells(4, 2, 6, 2); // Identificación
        wsDetalle.mergeCells(4, 3, 6, 3); // Apellido
        wsDetalle.mergeCells(4, 4, 6, 4); // Nombre

        let colIndex = 5;

        // Ordenar módulos
        const ordenModulos = [...modulos];
        if (tareasPorModulo["Sin Módulo"]) ordenModulos.push("Sin Módulo");

        const modulosConTareas = ordenModulos.filter(m => tareasPorModulo[m]);
        Object.keys(tareasPorModulo).forEach(m => {
            if (!modulosConTareas.includes(m)) modulosConTareas.push(m);
        });

        modulosConTareas.forEach((moduloNombre) => {
            const tareasDelModulo = tareasPorModulo[moduloNombre];

            // Fila 1: Nombre del Módulo
            const cellModulo = row1.getCell(colIndex);
            cellModulo.value = moduloNombre.toUpperCase();

            if (tareasDelModulo.length > 0) {
                wsDetalle.mergeCells(4, colIndex, 4, colIndex + tareasDelModulo.length - 1);
            }

            // Agrupar por categoría (Fila 2)
            let currentCategory = "";
            let categoryStartCol = colIndex;
            let categoryCount = 0;
            let categoryPond = 0;

            tareasDelModulo.forEach((tarea, idx) => {
                const tareaCat = tarea.categoria_nombre || "Sin Categoría";
                const tareaPond = tarea.categoria_ponderacion || 0;

                if (idx === 0) {
                    currentCategory = tareaCat;
                    categoryPond = tareaPond;
                    categoryStartCol = colIndex + idx;
                }

                if (tareaCat !== currentCategory) {
                    // Cerrar grupo anterior
                    const cellCat = row2.getCell(categoryStartCol);
                    cellCat.value = `CATEGORÍA: ${currentCategory.toUpperCase()} (${categoryPond} PTS)`;
                    if (categoryCount > 1) {
                        wsDetalle.mergeCells(5, categoryStartCol, 5, categoryStartCol + categoryCount - 1);
                    }
                    // Iniciar nuevo
                    currentCategory = tareaCat;
                    categoryPond = tareaPond;
                    categoryStartCol = colIndex + idx;
                    categoryCount = 0;
                }
                categoryCount++;

                // Cerrar último grupo
                if (idx === tareasDelModulo.length - 1) {
                    const cellCat = row2.getCell(categoryStartCol);
                    cellCat.value = `CATEGORÍA: ${currentCategory.toUpperCase()} (${categoryPond} PTS)`;
                    if (categoryCount > 1) {
                        wsDetalle.mergeCells(5, categoryStartCol, 5, categoryStartCol + categoryCount - 1);
                    }
                }
            });

            // Conteo para ponderación
            const conteoPorCategoria = {};
            tareasDelModulo.forEach(t => {
                const cat = t.categoria_nombre || "Sin Categoría";
                conteoPorCategoria[cat] = (conteoPorCategoria[cat] || 0) + 1;
            });

            // Fila 3: Tareas
            tareasDelModulo.forEach((tarea) => {
                const catNombre = tarea.categoria_nombre || "Sin Categoría";
                const catPond = tarea.categoria_ponderacion || 0;
                const numTareasEnCat = conteoPorCategoria[catNombre] || 1;
                const valorTareaPonderado = numTareasEnCat > 0 ? (catPond / numTareasEnCat) : 0;

                const cellTarea = row3.getCell(colIndex);
                cellTarea.value = `${tarea.titulo.toUpperCase()} (${valorTareaPonderado.toFixed(2)})`;

                const cellPonderacion = row3.getCell(colIndex);
                cellPonderacion.font = { italic: false, size: 9, color: { argb: 'FF000000' } };
                cellPonderacion.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

                colIndex++;
            });
        });

        // Estilos generales de headers
        [row1, row2, row3].forEach(row => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
                };
                cell.font = { bold: true };
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            });
        });

        // Promedios por Módulo
        modulos.forEach((modulo) => {
            const cellProm = row1.getCell(colIndex);
            cellProm.value = `PROMEDIO ${modulo.toUpperCase()}`;
            wsDetalle.mergeCells(4, colIndex, 6, colIndex);
            colIndex++;
        });

        // Promedio Global
        const cellGlobal = row1.getCell(colIndex);
        cellGlobal.value = "PROMEDIO GLOBAL (/10PTS)";
        wsDetalle.mergeCells(4, colIndex, 6, colIndex);

        // Estilos finales headers (Filas 4, 5, 6)
        const estiloBaseHeader = {
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        for (let r = 4; r <= 6; r++) {
            const row = wsDetalle.getRow(r);
            row.eachCell((cell) => {
                cell.style = {
                    ...estiloBaseHeader,
                    font: { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' }
                };
            });
        }

        wsDetalle.getRow(4).height = 35;
        wsDetalle.getRow(5).height = 45;
        wsDetalle.getRow(6).height = 45;

        // Datos de Estudiantes
        estudiantes.forEach((est, index) => {
            const rowData = [
                index + 1,
                (est.identificacion || '').toUpperCase(),
                est.apellido.toUpperCase(),
                est.nombre.toUpperCase()
            ];

            // Calificaciones Tareas
            modulosConTareas.forEach((moduloNombre) => {
                const tareasDelModulo = tareasPorModulo[moduloNombre];
                tareasDelModulo.forEach((tarea) => {
                    const nota = est.calificaciones[tarea.id_tarea];
                    rowData.push(nota !== null && nota !== undefined && typeof nota === 'number' ? nota : "-");
                });
            });

            // Promedios Módulos
            modulos.forEach((modulo) => {
                const moduloDetalle = est.modulos_detalle?.find((m) => m.nombre_modulo === modulo);
                const promedioModulo = moduloDetalle ? parseFloat(moduloDetalle.promedio_modulo_sobre_10) : 0;
                rowData.push(promedioModulo > 0 ? promedioModulo : "-");
            });

            // Promedio Global
            const promedioGlobal = est.promedio_global ? parseFloat(est.promedio_global) : 0;
            rowData.push(promedioGlobal);

            const row = wsDetalle.addRow(rowData);

            row.eachCell((cell, colNumber) => {
                cell.border = { top: { style: 'thin', color: { argb: 'FF000000' } }, left: { style: 'thin', color: { argb: 'FF000000' } }, bottom: { style: 'thin', color: { argb: 'FF000000' } }, right: { style: 'thin', color: { argb: 'FF000000' } } };
                cell.alignment = { vertical: 'middle', horizontal: (colNumber === 1 || colNumber === 2) ? 'center' : (colNumber <= 4 ? 'left' : 'center'), wrapText: true };
                cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF000000' } };

                if (colNumber === 1 && typeof cell.value === 'number') cell.numFmt = '0';
                else if (colNumber > 4 && typeof cell.value === 'number') cell.numFmt = '0.00';
            });
        });

        ajustarAnchoColumnas(wsDetalle, { maxNameWidth: 30, maxModuleWidth: 15 });

        // Encabezados Superiores Dinámicos
        const totalColsDetalle = colIndex - 1;
        if (totalColsDetalle > 0) {
            const safeMergeCols = Math.max(6, totalColsDetalle);
            wsDetalle.mergeCells(1, 1, 1, safeMergeCols);
            const cellTitle = wsDetalle.getCell(1, 1);
            cellTitle.value = `REPORTE DE CALIFICACIONES POR TAREA - ${(cursoNombre || '').toUpperCase()}`;
            cellTitle.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
            cellTitle.alignment = { horizontal: 'center', vertical: 'middle' };

            wsDetalle.mergeCells(2, 1, 2, safeMergeCols);
            const cellInfo = wsDetalle.getCell(2, 1);
            const horarioTexto = `${cursoActual?.horario?.toUpperCase() || ''} ${cursoActual?.hora_inicio ? `(${cursoActual.hora_inicio.slice(0, 5)} - ${cursoActual.hora_fin?.slice(0, 5)})` : ''}`;
            cellInfo.value = `DOCENTE: ${nombreDocente.toUpperCase()} | HORARIO: ${horarioTexto}`;
            cellInfo.font = { size: 10, name: 'Calibri', color: { argb: 'FF000000' } };
            cellInfo.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }


        // ============================================
        // Hoja 2: Promedios por Módulo
        // ============================================
        const wsModulos = workbook.addWorksheet('Promedios por Módulo', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 } },
            headerFooter: standardFooter
        });

        wsModulos.spliceRows(1, 0, [], [], []);
        wsModulos.getRow(1).height = 25;
        wsModulos.getRow(2).height = 35;

        const headersModulos = ['#', 'IDENTIFICACIÓN', 'APELLIDO', 'NOMBRE', ...modulos.map(m => `${m.toUpperCase()} (/10.00PTS)`), 'PROMEDIO GLOBAL (/10PTS)'];
        const totalColsModulos = headersModulos.length;
        const safeMergeColsMod = Math.max(6, totalColsModulos);

        wsModulos.mergeCells(1, 1, 1, safeMergeColsMod);
        const cellTitleMod = wsModulos.getCell(1, 1);
        cellTitleMod.value = `REPORTE DE PROMEDIOS POR MÓDULO - ${(cursoNombre || '').toUpperCase()}`;
        cellTitleMod.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
        cellTitleMod.alignment = { horizontal: 'center', vertical: 'middle' };

        wsModulos.mergeCells(2, 1, 2, safeMergeColsMod);
        const cellInfoMod = wsModulos.getCell(2, 1);
        const horarioTextoMod = `${cursoActual?.horario?.toUpperCase() || ''} ${cursoActual?.hora_inicio ? `(${cursoActual.hora_inicio.slice(0, 5)} - ${cursoActual.hora_fin?.slice(0, 5)})` : ''}`;
        cellInfoMod.value = `DOCENTE: ${nombreDocente.toUpperCase()} | HORARIO: ${horarioTextoMod}`;
        cellInfoMod.font = { size: 10, name: 'Calibri', color: { argb: 'FF000000' } };
        cellInfoMod.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        const rowHeaderMod = wsModulos.addRow(headersModulos);
        rowHeaderMod.height = 30;
        rowHeaderMod.eachCell((cell) => {
            cell.style = {
                font: { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' },
                alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
                border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
            };
        });

        estudiantes.forEach((est, index) => {
            const rowData = [index + 1, (est.identificacion || '').toUpperCase(), est.apellido.toUpperCase(), est.nombre.toUpperCase()];
            modulos.forEach(modulo => {
                const moduloDetalle = est.modulos_detalle?.find((m) => m.nombre_modulo === modulo);
                const promedioModulo = moduloDetalle ? parseFloat(moduloDetalle.promedio_modulo_sobre_10) : 0;
                rowData.push(promedioModulo > 0 ? promedioModulo : "-");
            });
            const promedioGlobal = est.promedio_global ? parseFloat(est.promedio_global) : 0;
            rowData.push(promedioGlobal);

            const row = wsModulos.addRow(rowData);
            row.eachCell((cell, colNumber) => {
                cell.border = { top: { style: 'thin', color: { argb: 'FF000000' } }, bottom: { style: 'thin', color: { argb: 'FF000000' } }, left: { style: 'thin', color: { argb: 'FF000000' } }, right: { style: 'thin', color: { argb: 'FF000000' } } };
                if (colNumber === 1 || colNumber === 2) cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                else if (colNumber <= 4) cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                else cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF000000' } };

                if (colNumber === 1 && typeof cell.value === 'number') cell.numFmt = '0';
                else if (colNumber > 4 && typeof cell.value === 'number') cell.numFmt = '0.00';
            });
        });

        ajustarAnchoColumnas(wsModulos, { maxNameWidth: 30, maxModuleWidth: 15 });


        // ============================================
        // Hoja 3: Estadísticas
        // ============================================
        const wsEstadisticas = workbook.addWorksheet('Estadísticas', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 } },
            headerFooter: standardFooter
        });

        wsEstadisticas.spliceRows(1, 0, [], [], []);
        wsEstadisticas.mergeCells(1, 1, 1, 6);
        const cellTitleEst = wsEstadisticas.getCell(1, 1);
        cellTitleEst.value = `ESTADÍSTICAS DE CALIFICACIONES - ${(cursoNombre || '').toUpperCase()}`;
        cellTitleEst.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
        cellTitleEst.alignment = { horizontal: 'center', vertical: 'middle' };
        wsEstadisticas.getRow(1).height = 25;

        wsEstadisticas.mergeCells(2, 1, 2, 6);
        const cellInfoEst = wsEstadisticas.getCell(2, 1);
        const horarioTextoEst = `${cursoActual?.horario?.toUpperCase() || ''} ${cursoActual?.hora_inicio ? `(${cursoActual.hora_inicio.slice(0, 5)} - ${cursoActual.hora_fin?.slice(0, 5)})` : ''}`;
        cellInfoEst.value = `DOCENTE: ${nombreDocente.toUpperCase()} | HORARIO: ${horarioTextoEst}`;
        cellInfoEst.font = { size: 10, name: 'Calibri', color: { argb: 'FF000000' } };
        cellInfoEst.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        wsEstadisticas.getRow(2).height = 35;

        const aprobadosGlobal = estudiantes.filter((est) => (parseFloat(est.promedio_global) || 0) >= 7).length;
        const reprobadosGlobal = estudiantes.length - aprobadosGlobal;

        // Promedio General (de todas las tareas) - promedio simple
        const promedioGeneral = estudiantes.length > 0 ? (estudiantes.reduce((sum, est) => sum + est.promedio, 0) / estudiantes.length) : 0;

        // Promedio Global del Curso (balanceado)
        const sumaPromediosGlobales = estudiantes.reduce((sum, est) => sum + (parseFloat(est.promedio_global) || 0), 0);
        const promedioGlobalCurso = estudiantes.length > 0 ? (sumaPromediosGlobales / estudiantes.length) : 0;

        const porcentajeAprobacion = estudiantes.length > 0 ? (aprobadosGlobal / estudiantes.length) : 0;

        // Calcular peso por módulo
        const modulosNombres = estudiantes.length > 0 && estudiantes[0].modulos_detalle
            ? estudiantes[0].modulos_detalle.map(m => m.nombre_modulo)
            : [];
        const pesoPorModulo = modulosNombres.length > 0 ? (10.0 / modulosNombres.length) : 0;

        const datosEstadisticas = [
            ["MÉTRICA", "VALOR"],
            ["TOTAL DE ESTUDIANTES", estudiantes.length],
            ["ESTUDIANTES APROBADOS (≥7/10)", aprobadosGlobal],
            ["ESTUDIANTES REPROBADOS (<7/10)", reprobadosGlobal],
            ["PORCENTAJE DE APROBACIÓN", porcentajeAprobacion],
            ["", ""],
            ["PROMEDIO GLOBAL DEL CURSO (/10PTS)", promedioGlobalCurso],
            ["PROMEDIO GENERAL (TAREAS)", promedioGeneral],
            ["", ""],
            ["TOTAL DE TAREAS EVALUADAS", tareas.length],
            ["TOTAL DE MÓDULOS EN EL CURSO", modulosNombres.length],
            ["PESO POR MÓDULO", pesoPorModulo],
            ["", ""],
            ["NOTA MÍNIMA DE APROBACIÓN", "7.0 / 10 PUNTOS"],
            ["SISTEMA DE CALIFICACIÓN", "TODOS LOS MÓDULOS TIENEN IGUAL PESO"],
        ];

        datosEstadisticas.forEach((rowValues, idx) => {
            const row = wsEstadisticas.addRow(rowValues);
            const rowIndex = row.number;

            // Combinar columna Valor (B) con C, D, E y F para que no se corte el texto
            wsEstadisticas.mergeCells(rowIndex, 2, rowIndex, 6);

            row.eachCell((cell, colNum) => {
                cell.border = { top: { style: 'thin', color: { argb: 'FF000000' } }, left: { style: 'thin', color: { argb: 'FF000000' } }, bottom: { style: 'thin', color: { argb: 'FF000000' } }, right: { style: 'thin', color: { argb: 'FF000000' } } };

                if (idx === 0) { // Header
                    cell.font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                } else {
                    cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center', wrapText: true };
                    if (colNum === 1) cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF000000' } };
                    else cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF000000' } };

                    if (rowValues[0] === "PORCENTAJE DE APROBACIÓN" && colNum === 2) {
                        cell.numFmt = '0.0%';
                    } else if (typeof cell.value === 'number' && colNum === 2) {
                        cell.numFmt = '0.00';
                    }
                }
            });
        });

        ajustarAnchoColumnas(wsEstadisticas);

        return await workbook.xlsx.writeBuffer();
    } catch (error) {
        console.error("Error generating Excel:", error);
        throw error;
    }
};

module.exports = {
    generarExcelCalificacionesCurso
};
