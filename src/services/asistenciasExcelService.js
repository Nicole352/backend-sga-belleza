const ExcelJS = require('exceljs');

/**
 * Genera un Excel de asistencia para una fecha específica
 * Idéntico al frontend TomarAsistencia.tsx función descargarExcel()
 */
const generarExcelAsistenciaFecha = async (data) => {
    try {
        const {
            cursoNombre,
            cursoActual, // { horario, hora_inicio, hora_fin, tipo_curso_nombre }
            nombreDocente,
            fechaSeleccionada, // YYYY-MM-DD
            estudiantes, // Array de estudiantes ordenados alfabéticamente
            asistencias // Map o Array de registros de asistencia
        } = data;

        const workbook = new ExcelJS.Workbook();

        // Convertir asistencias a Map si viene como array
        const asistenciasMap = new Map();
        if (Array.isArray(asistencias)) {
            asistencias.forEach(a => {
                asistenciasMap.set(a.id_estudiante, a);
            });
        } else {
            // Ya es un Map o objeto
            Object.entries(asistencias).forEach(([key, value]) => {
                asistenciasMap.set(parseInt(key), value);
            });
        }

        // Función para contar estados
        const contarEstados = () => {
            let presentes = 0;
            let ausentes = 0;
            let tardanzas = 0;
            let justificados = 0;

            asistenciasMap.forEach((registro) => {
                switch (registro.estado) {
                    case 'presente': presentes++; break;
                    case 'ausente': ausentes++; break;
                    case 'tardanza': tardanzas++; break;
                    case 'justificado': justificados++; break;
                }
            });

            return { presentes, ausentes, tardanzas, justificados };
        };

        const stats = contarEstados();

        // ============ HOJA 1: Detalle de Asistencia ============
        const wsDetalle = workbook.addWorksheet('Detalle de Asistencia', {
            pageSetup: {
                paperSize: 9, // A4
                orientation: 'landscape',
                fitToPage: true,
                fitToWidth: 1,
                fitToHeight: 0,
                margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 }
            },
            headerFooter: {
                oddFooter: `&L&"-,Bold"&14Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
            }
        });

        // Configurar columnas
        wsDetalle.columns = [
            { header: 'N°', key: 'num', width: 8 },
            { header: 'IDENTIFICACIÓN', key: 'identificacion', width: 20 },
            { header: 'APELLIDOS', key: 'apellidos', width: 35 },
            { header: 'NOMBRES', key: 'nombres', width: 35 },
            { header: 'ESTADO', key: 'estado', width: 18 },
            { header: 'OBSERVACIONES', key: 'observaciones', width: 50 }
        ];

        // Estilo de encabezado
        wsDetalle.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FF000000' }, name: 'Calibri', size: 10 };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFFFFF' }
            };
        });
        wsDetalle.getRow(1).height = 20;

        // Insertar 3 filas al inicio para el encabezado informativo
        wsDetalle.spliceRows(1, 0, [], [], []);

        // Fila 1: Título del reporte
        wsDetalle.mergeCells('A1:F1');
        wsDetalle.getCell('A1').value = `REPORTE DE ASISTENCIA - ${(cursoNombre || '').toUpperCase()}`;
        wsDetalle.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
        wsDetalle.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        wsDetalle.getRow(1).height = 25;

        // Fila 2: Información del docente y fecha
        wsDetalle.mergeCells('A2:F2');
        const horarioTexto = `${cursoActual?.horario?.toUpperCase() || ''} ${cursoActual?.hora_inicio ? `(${cursoActual.hora_inicio.slice(0, 5)} - ${cursoActual.hora_fin?.slice(0, 5)})` : ''}`;
        wsDetalle.getCell('A2').value = `DOCENTE: ${nombreDocente.toUpperCase()} | FECHA: ${fechaSeleccionada.split('-').reverse().join('/')} | HORARIO: ${horarioTexto.toUpperCase()}`;
        wsDetalle.getCell('A2').font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
        wsDetalle.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        wsDetalle.getRow(2).height = 35;

        // Fila 3: Espacio vacío
        wsDetalle.getRow(3).height = 5;

        // Ahora los encabezados de columnas están en la fila 4
        wsDetalle.getRow(4).height = 20;

        // Agregar datos
        estudiantes.forEach((est, index) => {
            const registro = asistenciasMap.get(est.id_estudiante);
            const row = wsDetalle.addRow({
                num: index + 1,
                identificacion: est.cedula || est.identificacion,
                apellidos: (est.apellido || est.apellidos || '').toUpperCase(),
                nombres: (est.nombre || est.nombres || '').toUpperCase(),
                estado: registro ? registro.estado.toUpperCase() : 'SIN REGISTRAR',
                observaciones: (registro?.observaciones || '').toUpperCase()
            });

            // Aplicar estilos
            row.eachCell((cell, colNumber) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF000000' } },
                    bottom: { style: 'thin', color: { argb: 'FF000000' } },
                    left: { style: 'thin', color: { argb: 'FF000000' } },
                    right: { style: 'thin', color: { argb: 'FF000000' } }
                };

                // Texto en negro para todas las columnas
                cell.font = { size: 10, name: 'Calibri', bold: colNumber === 5 };

                cell.alignment = { vertical: 'middle', wrapText: true };

                // Centrar N° y Estado
                if (colNumber === 1 || colNumber === 5) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                }

                // Formato de número para la columna N°
                if (colNumber === 1) {
                    cell.numFmt = '0';
                }
                // Formato texto para identificación (Cédula)
                if (colNumber === 2) {
                    cell.numFmt = '@';
                }
            });
        });

        // ============ HOJA 2: Resumen ============
        const wsResumen = workbook.addWorksheet('Resumen', {
            pageSetup: {
                paperSize: 9,
                orientation: 'landscape',
                fitToPage: true,
                fitToWidth: 1,
                fitToHeight: 0,
                margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 }
            },
            headerFooter: {
                oddFooter: `&L&"-,Bold"&14Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
            }
        });

        const totalEstudiantes = estudiantes.length;
        const totalRegistrados = asistenciasMap.size;
        const sinRegistrar = totalEstudiantes - totalRegistrados;
        const porcentajeAsistencia = totalEstudiantes > 0
            ? ((stats.presentes / totalEstudiantes) * 100).toFixed(2)
            : '0.00';

        wsResumen.columns = [
            { header: 'INFORMACIÓN', key: 'info', width: 60 },
            { header: 'VALOR', key: 'valor', width: 60 }
        ];

        // Insertar 3 filas al inicio para el encabezado informativo
        wsResumen.spliceRows(1, 0, [], [], []);

        // Fila 1: Título del reporte
        wsResumen.mergeCells('A1:B1');
        wsResumen.getCell('A1').value = `RESUMEN DE ASISTENCIA DIARIA - ${(cursoNombre || '').toUpperCase()}`;
        wsResumen.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
        wsResumen.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        wsResumen.getRow(1).height = 25;

        // Fila 2: Información del docente y fecha
        wsResumen.mergeCells('A2:B2');
        const horarioTextoRes = `${cursoActual?.horario?.toUpperCase() || ''} ${cursoActual?.hora_inicio ? `(${cursoActual.hora_inicio.slice(0, 5)} - ${cursoActual.hora_fin?.slice(0, 5)})` : ''}`;
        wsResumen.getCell('A2').value = `DOCENTE: ${nombreDocente.toUpperCase()} | FECHA: ${fechaSeleccionada.split('-').reverse().join('/')} | HORARIO: ${horarioTextoRes.toUpperCase()}`;
        wsResumen.getCell('A2').font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
        wsResumen.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        wsResumen.getRow(2).height = 35;

        // Fila 3: Espacio vacío
        wsResumen.getRow(3).height = 5;

        // Ahora los encabezados de columnas están en la fila 4
        wsResumen.getRow(4).height = 20;
        wsResumen.getRow(4).eachCell((cell) => {
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Agregar datos de resumen
        const datosResumen = [
            ['CURSO', (cursoNombre || '').toUpperCase()],
            ['DOCENTE', nombreDocente.toUpperCase()],
            ['TIPO DE CURSO', (cursoActual?.tipo_curso_nombre || '').toUpperCase()],
            ['HORARIO', (cursoActual?.horario?.toUpperCase() || '')],
            ['FECHA', fechaSeleccionada.split('-').reverse().join('/')],
            ['', ''],
            ['ESTADÍSTICAS DE ASISTENCIA', ''],
            ['TOTAL ESTUDIANTES', totalEstudiantes],
            ['TOTAL REGISTRADOS', totalRegistrados],
            ['SIN REGISTRAR', sinRegistrar],
            ['', ''],
            ['PRESENTES', stats.presentes],
            ['AUSENTES', stats.ausentes],
            ['TARDANZAS', stats.tardanzas],
            ['JUSTIFICADOS', stats.justificados],
            ['', ''],
            ['PORCENTAJE DE ASISTENCIA', `${porcentajeAsistencia}%`]
        ];

        datosResumen.forEach(([info, valor]) => {
            const row = wsResumen.addRow({ info, valor });

            row.eachCell((cell, colNumber) => {
                if (info === 'ESTADÍSTICAS DE ASISTENCIA' || info === 'PORCENTAJE DE ASISTENCIA') {
                    cell.font = { bold: true };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                } else if (info !== '') {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                    cell.font = {
                        size: 10,
                        name: 'Calibri',
                        bold: colNumber === 1
                    };
                    if (colNumber === 2) {
                        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

                        // Formatos específicos
                        if (info === 'PORCENTAJE DE ASISTENCIA') {
                            const numVal = parseFloat(valor.toString().replace('%', ''));
                            if (!isNaN(numVal)) {
                                cell.value = numVal / 100;
                                cell.numFmt = '0.00%';
                            }
                        } else if (typeof valor === 'number') {
                            cell.numFmt = '0';
                        }
                    }
                }
            });
        });

        // Generar archivo
        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    } catch (error) {
        console.error('Error generando Excel de asistencia:', error);
        throw error;
    }
};

/**
 * Genera un Excel de asistencia para un rango de fechas
 * Idéntico al frontend TomarAsistencia.tsx función descargarExcelRango()
 */
const generarExcelAsistenciaRango = async (data) => {
    try {
        const {
            cursoNombre,
            cursoActual, // { horario, hora_inicio, hora_fin, tipo_curso_nombre }
            nombreDocente,
            fechaInicio, // YYYY-MM-DD
            fechaFin, // YYYY-MM-DD
            estudiantes, // Array de estudiantes ordenados alfabéticamente
            registros, // Array de registros de asistencia del rango
            modulos // Array de módulos (opcional)
        } = data;

        const workbook = new ExcelJS.Workbook();

        // ============ HOJA 1: Resumen por Estudiante ============
        const wsResumen = workbook.addWorksheet('Resumen por Estudiante', {
            pageSetup: {
                paperSize: 9,
                orientation: 'landscape',
                fitToPage: true,
                fitToWidth: 1,
                fitToHeight: 0,
                margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 }
            },
            headerFooter: {
                oddFooter: `&L&"-,Bold"&14Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
            }
        });

        // Definir columnas
        wsResumen.columns = [
            { header: 'N°', key: 'num', width: 8 },
            { header: 'IDENTIFICACIÓN', key: 'identificacion', width: 20 },
            { header: 'APELLIDO', key: 'apellido', width: 35 },
            { header: 'NOMBRE', key: 'nombre', width: 35 },
            { header: 'TOTAL CLASES', key: 'totalClases', width: 18 },
            { header: 'PRESENTES', key: 'presentes', width: 15 },
            { header: 'AUSENTES', key: 'ausentes', width: 15 },
            { header: 'TARDANZAS', key: 'tardanzas', width: 15 },
            { header: 'JUSTIFICADOS', key: 'justificados', width: 18 },
            { header: '% ASISTENCIA', key: 'porcentaje', width: 18 }
        ];

        // Agregar datos
        estudiantes.forEach((est, index) => {
            const registrosEst = registros.filter((r) => r.id_estudiante === est.id_estudiante);
            const totalClases = registrosEst.length;
            const presentes = registrosEst.filter((r) => r.estado === 'presente').length;
            const ausentes = registrosEst.filter((r) => r.estado === 'ausente').length;
            const tardanzas = registrosEst.filter((r) => r.estado === 'tardanza').length;
            const justificados = registrosEst.filter((r) => r.estado === 'justificado').length;
            const porcentaje = totalClases > 0 ? ((presentes / totalClases) * 100).toFixed(2) : '0.00';

            wsResumen.addRow({
                num: index + 1,
                identificacion: est.cedula || est.identificacion,
                apellido: (est.apellido || est.apellidos || '').toUpperCase(),
                nombre: (est.nombre || est.nombres || '').toUpperCase(),
                totalClases,
                presentes,
                ausentes,
                tardanzas,
                justificados,
                porcentaje: `${porcentaje}%`
            });
        });

        // Insertar 3 filas al inicio para el encabezado informativo
        wsResumen.spliceRows(1, 0, [], [], []);

        // Fila 1: Título del reporte
        wsResumen.mergeCells('A1:J1');
        wsResumen.getCell('A1').value = `RESUMEN DE ASISTENCIA POR ESTUDIANTE - ${(cursoNombre || '').toUpperCase()}`;
        wsResumen.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
        wsResumen.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        wsResumen.getRow(1).height = 25;

        // Fila 2: Información del docente y periodo
        wsResumen.mergeCells('A2:J2');
        const horarioTextoRango = `${cursoActual?.horario?.toUpperCase() || ''} ${cursoActual?.hora_inicio ? `(${cursoActual.hora_inicio.slice(0, 5)} - ${cursoActual.hora_fin?.slice(0, 5)})` : ''}`;
        wsResumen.getCell('A2').value = `DOCENTE: ${nombreDocente.toUpperCase()} | PERIODO: ${fechaInicio.split('-').reverse().join('/')} AL ${fechaFin.split('-').reverse().join('/')} | HORARIO: ${horarioTextoRango.toUpperCase()}`;
        wsResumen.getCell('A2').font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
        wsResumen.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        wsResumen.getRow(2).height = 35;

        // Fila 3: Espacio vacío
        wsResumen.getRow(3).height = 5;

        // Estilos para encabezados (ahora en la fila 4)
        wsResumen.getRow(4).height = 20;
        wsResumen.getRow(4).eachCell((cell) => {
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Estilos para filas de datos
        wsResumen.eachRow((row, rowNumber) => {
            if (rowNumber > 4) { // Empezamos después del encabezado (fila 4)
                row.eachCell((cell, colNumber) => {
                    cell.font = { size: 10, name: 'Calibri' };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'E5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
                        left: { style: 'thin', color: { argb: 'E5E7EB' } },
                        right: { style: 'thin', color: { argb: 'E5E7EB' } }
                    };

                    // Centrar columnas numéricas (N° y columnas 5-10)
                    if (colNumber === 1 || colNumber >= 5) {
                        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    } else {
                        cell.alignment = { vertical: 'middle', wrapText: true };
                    }

                    // Formatos numéricos
                    if (colNumber === 1 || (colNumber >= 5 && colNumber <= 9)) {
                        cell.numFmt = '0';
                    } else if (colNumber === 2) {
                        cell.numFmt = '@'; // Identificación como texto
                    } else if (colNumber === 10) {
                        // Convertir string "XX.XX%" a numero 0.XXXX
                        const valStr = cell.value ? cell.value.toString() : '';
                        if (valStr.includes('%')) {
                            const num = parseFloat(valStr.replace('%', ''));
                            if (!isNaN(num)) {
                                cell.value = num / 100;
                                cell.numFmt = '0.00%';
                            }
                        }
                    }
                });
            }
        });

        // ============ HOJA 2: Detalle Día por Día (Agrupado por Fecha) ============
        const wsDetalle = workbook.addWorksheet('Detalle Día por Día', {
            pageSetup: {
                paperSize: 9,
                orientation: 'landscape',
                fitToPage: true,
                fitToWidth: 1,
                fitToHeight: 0,
                margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 }
            },
            headerFooter: {
                oddFooter: `&L&"-,Bold"&14Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
            }
        });

        wsDetalle.columns = [
            { header: 'CLASE/FECHA', key: 'clase', width: 35 },
            { header: 'N°', key: 'num', width: 8 },
            { header: 'IDENTIFICACIÓN', key: 'identificacion', width: 20 },
            { header: 'APELLIDO', key: 'apellido', width: 35 },
            { header: 'NOMBRE', key: 'nombre', width: 35 },
            { header: 'ESTADO', key: 'estado', width: 18 },
            { header: 'OBSERVACIONES', key: 'observaciones', width: 50 }
        ];

        // Agrupar registros por fecha
        const registrosPorFecha = new Map();
        registros.forEach((r) => {
            // Asegurar que usamos un string para agrupar, ya que los objetos Date son distintos por referencia
            const fechaKey = r.fecha instanceof Date ? r.fecha.toISOString().split('T')[0] : r.fecha;

            if (!registrosPorFecha.has(fechaKey)) {
                registrosPorFecha.set(fechaKey, []);
            }
            registrosPorFecha.get(fechaKey).push(r);
        });

        // Ordenar fechas
        const fechasOrdenadas = Array.from(registrosPorFecha.keys()).sort();

        // Insertar 3 filas al inicio para el encabezado informativo
        wsDetalle.spliceRows(1, 0, [], [], []);

        // Fila 1: Título del reporte
        wsDetalle.mergeCells('A1:G1');
        wsDetalle.getCell('A1').value = `DETALLE DE ASISTENCIA POR CLASE - ${(cursoNombre || '').toUpperCase()}`;
        wsDetalle.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
        wsDetalle.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        wsDetalle.getRow(1).height = 25;

        // Fila 2: Información del docente y periodo
        wsDetalle.mergeCells('A2:G2');
        wsDetalle.getCell('A2').value = `DOCENTE: ${nombreDocente.toUpperCase()} | PERIODO: ${fechaInicio.split('-').reverse().join('/')} AL ${fechaFin.split('-').reverse().join('/')} | HORARIO: ${horarioTextoRango.toUpperCase()}`;
        wsDetalle.getCell('A2').font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
        wsDetalle.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        wsDetalle.getRow(2).height = 35;

        // Fila 3: Espacio vacío
        wsDetalle.getRow(3).height = 5;

        // Ahora los encabezados de columnas están en la fila 4
        wsDetalle.getRow(4).height = 20;

        let numeroClase = 1;
        let filaActual = 5; // Empezamos después del encabezado (fila 4) + 1

        fechasOrdenadas.forEach((fechaKey) => {
            const registrosFecha = registrosPorFecha.get(fechaKey);

            // Formatear fecha para mostrar
            let fechaFormateada = fechaKey;
            if (fechaFormateada.includes('-')) {
                const partes = fechaFormateada.split('-');
                // Asumimos YYYY-MM-DD
                if (partes[0].length === 4) {
                    fechaFormateada = `${partes[2]}-${partes[1]}-${partes[0]}`;
                }
            }

            const filaInicio = filaActual;

            // Agregar cada estudiante de esta fecha
            registrosFecha.forEach((r, index) => {
                const estudiante = estudiantes.find(e => e.id_estudiante === r.id_estudiante);

                wsDetalle.addRow({
                    clase: filaActual === filaInicio ? `CLASE ${numeroClase}\n${fechaFormateada}` : '',
                    num: index + 1,
                    identificacion: estudiante?.cedula || estudiante?.identificacion || '',
                    apellido: (estudiante?.apellido || estudiante?.apellidos || '').toUpperCase(),
                    nombre: (estudiante?.nombre || estudiante?.nombres || '').toUpperCase(),
                    estado: r.estado.toUpperCase(),
                    observaciones: (r.observaciones || '').toUpperCase()
                });

                filaActual++;
            });

            // Combinar celdas de la columna Clase/Fecha para este grupo
            if (registrosFecha.length > 1) {
                wsDetalle.mergeCells(filaInicio, 1, filaActual - 1, 1);
            }

            numeroClase++;
        });

        // Estilos para encabezados
        wsDetalle.getRow(4).eachCell((cell) => {
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            };
        });

        // Estilos para filas de datos
        wsDetalle.eachRow((row, rowNumber) => {
            if (rowNumber > 4) { // Empezamos después del encabezado (fila 4)
                row.eachCell((cell, colNumber) => {
                    // Estilo para columna Clase/Fecha (columna 1)
                    if (colNumber === 1) {
                        cell.font = {
                            size: 10,
                            name: 'Calibri',
                            bold: true,
                            color: { argb: 'FF000000' }
                        };
                        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    } else {
                        cell.font = { size: 10, name: 'Calibri', bold: colNumber === 6 };
                    }

                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } },
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };

                    // Centrar columnas: Clase, N° y Estado
                    if (colNumber === 1 || colNumber === 2 || colNumber === 6) {
                        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    } else {
                        cell.alignment = { vertical: 'middle', wrapText: true };
                    }

                    // Formatos numéricos
                    if (colNumber === 2) {
                        cell.numFmt = '0';
                    } else if (colNumber === 3) {
                        cell.numFmt = '@';
                    }
                });
            }
        });

        // ============ HOJA 3: Estadísticas Generales ============
        const wsEstadisticas = workbook.addWorksheet('Estadísticas Generales', {
            pageSetup: {
                paperSize: 9,
                orientation: 'landscape',
                fitToPage: true,
                fitToWidth: 1,
                fitToHeight: 0,
                margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 }
            },
            headerFooter: {
                oddFooter: `&L&"-,Bold"&14Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
            }
        });

        wsEstadisticas.columns = [
            { header: 'INFORMACIÓN', key: 'info', width: 60 },
            { header: 'VALOR', key: 'valor', width: 60 }
        ];

        // Calcular estadísticas
        const totalClasesStats = [...new Set(registros.map((r) => r.fecha))].length;
        const totalRegistros = registros.length;
        const totalPresentes = registros.filter((r) => r.estado === 'presente').length;
        const totalAusentes = registros.filter((r) => r.estado === 'ausente').length;
        const totalTardanzas = registros.filter((r) => r.estado === 'tardanza').length;
        const totalJustificados = registros.filter((r) => r.estado === 'justificado').length;
        const promedioAsistencia = totalRegistros > 0 ? ((totalPresentes / totalRegistros) * 100).toFixed(2) : '0.00';

        const estadisticasData = [
            { info: 'CURSO', valor: (cursoNombre || '').toUpperCase() },
            { info: 'DOCENTE', valor: nombreDocente.toUpperCase() },
            { info: 'TIPO DE CURSO', valor: (cursoActual?.tipo_curso_nombre || '').toUpperCase() },
            { info: 'HORARIO', valor: (cursoActual?.horario?.toUpperCase() || '') },
            { info: 'PERIODO', valor: `${fechaInicio.split('-').reverse().join('/')} AL ${fechaFin.split('-').reverse().join('/')}` },
            { info: '', valor: '' },
            { info: 'ESTADÍSTICAS DE ASISTENCIA', valor: '' },
            { info: 'TOTAL ESTUDIANTES', valor: estudiantes.length },
            { info: 'TOTAL CLASES REGISTRADAS', valor: totalClasesStats },
            { info: 'TOTAL REGISTROS', valor: totalRegistros },
            { info: '', valor: '' },
            { info: 'TOTAL PRESENTES', valor: totalPresentes },
            { info: 'TOTAL AUSENTES', valor: totalAusentes },
            { info: 'TOTAL TARDANZAS', valor: totalTardanzas },
            { info: 'TOTAL JUSTIFICADOS', valor: totalJustificados },
            { info: '', valor: '' },
            { info: 'PROMEDIO GENERAL DE ASISTENCIA', valor: `${promedioAsistencia}%` }
        ];

        // Insertar 3 filas al inicio para el encabezado informativo
        wsEstadisticas.spliceRows(1, 0, [], [], []);

        // Fila 1: Título del reporte
        wsEstadisticas.mergeCells('A1:B1');
        wsEstadisticas.getCell('A1').value = `REPORTE DE ESTADÍSTICAS - ${(cursoNombre || '').toUpperCase()}`;
        wsEstadisticas.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
        wsEstadisticas.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        wsEstadisticas.getRow(1).height = 25;

        // Fila 2: Información del docente y periodo
        wsEstadisticas.mergeCells('A2:B2');
        wsEstadisticas.getCell('A2').value = `DOCENTE: ${nombreDocente.toUpperCase()} | PERIODO: ${fechaInicio.split('-').reverse().join('/')} AL ${fechaFin.split('-').reverse().join('/')} | HORARIO: ${horarioTextoRango.toUpperCase()}`;
        wsEstadisticas.getCell('A2').font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
        wsEstadisticas.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        wsEstadisticas.getRow(2).height = 35;

        // Fila 3: Espacio vacío
        wsEstadisticas.getRow(3).height = 5;

        // Aplicar estilos a las filas de datos
        estadisticasData.forEach((data) => {
            wsEstadisticas.addRow(data);
        });

        // Estilos para headers (ahora fila 4)
        wsEstadisticas.getRow(4).height = 20;
        wsEstadisticas.getRow(4).eachCell((cell) => {
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Estilos para datos
        wsEstadisticas.eachRow((row, rowNumber) => {
            if (rowNumber > 4) {
                row.eachCell((cell, colNumber) => {
                    const cellValue = cell.value?.toString() || '';

                    // Títulos especiales
                    if (cellValue === 'ESTADÍSTICAS DE ASISTENCIA' || cellValue === 'PROMEDIO GENERAL DE ASISTENCIA') {
                        cell.font = { bold: true };
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FF000000' } },
                            bottom: { style: 'thin', color: { argb: 'FF000000' } },
                            left: { style: 'thin', color: { argb: 'FF000000' } },
                            right: { style: 'thin', color: { argb: 'FF000000' } }
                        };
                    } else if (cellValue === '') {
                        // Filas vacías
                        cell.alignment = { vertical: 'middle' };
                    } else {
                        cell.font = {
                            size: 10,
                            name: 'Calibri',
                            bold: colNumber === 1
                        };
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FF000000' } },
                            bottom: { style: 'thin', color: { argb: 'FF000000' } },
                            left: { style: 'thin', color: { argb: 'FF000000' } },
                            right: { style: 'thin', color: { argb: 'FF000000' } }
                        };

                        if (colNumber === 2) {
                            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

                            // Formatos específicos
                            const rowTitle = row.getCell(1).value?.toString() || '';
                            if (rowTitle === 'PROMEDIO GENERAL DE ASISTENCIA') {
                                const valStr = cell.value ? cell.value.toString() : '';
                                if (valStr.includes('%')) {
                                    const num = parseFloat(valStr.replace('%', ''));
                                    if (!isNaN(num)) {
                                        cell.value = num / 100;
                                        cell.numFmt = '0.00%';
                                    }
                                }
                            } else if (typeof cell.value === 'number') {
                                cell.numFmt = '0';
                            }
                        } else {
                            cell.alignment = { vertical: 'middle', wrapText: true };
                        }
                    }
                });
            }
        });

        // Generar archivo
        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    } catch (error) {
        console.error('Error generando Excel de asistencia por rango:', error);
        throw error;
    }
};

module.exports = {
    generarExcelAsistenciaFecha,
    generarExcelAsistenciaRango
};
