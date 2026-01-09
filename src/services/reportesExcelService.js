const ExcelJS = require('exceljs');
const axios = require('axios');

// URL del logo de la escuela
const LOGO_URL = 'https://res.cloudinary.com/di090ggjn/image/upload/v1757037016/clbfrmifo1mbpzma5qts.png';

/**
 * Descargar logo como base64 para Excel
 */
async function descargarLogoBase64() {
  try {
    const response = await axios.get(LOGO_URL, { responseType: 'arraybuffer' });
    return Buffer.from(response.data).toString('base64');
  } catch (error) {
    console.error('Error descargando logo:', error.message);
    return null;
  }
}

/**
 * Formatear fecha
 */
function formatearFecha(fecha) {
  if (!fecha) return 'N/A';
  const date = new Date(fecha);
  return date.toLocaleDateString('es-ES');
}


/**
 * GENERAR EXCEL - REPORTE DE ESTUDIANTES
 */
async function generarExcelEstudiantes(datos, filtros, estadisticas) {
  try {
    const workbook = new ExcelJS.Workbook();

    // Metadata del archivo
    workbook.creator = 'Sistema SGA Belleza';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.lastModifiedBy = 'Sistema SGA Belleza';

    // HOJA 1: DATOS DETALLADOS
    const hojaDatos = workbook.addWorksheet('Estudiantes', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0, // 0 significa automático
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.3,
          bottom: 0.75,
          header: 0.1,
          footer: 0.3
        },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Configurar columnas con anchos optimizados para impresión
    hojaDatos.columns = [
      { header: '#', key: 'indice', width: 6 },
      { header: 'IDENTIFICACIÓN', key: 'cedula', width: 20 },
      { header: 'APELLIDOS', key: 'apellido', width: 25 },
      { header: 'NOMBRES', key: 'nombre', width: 25 },
      { header: 'EMAIL', key: 'email', width: 35 },
      { header: 'TELÉFONO', key: 'telefono', width: 15 },
      { header: 'GÉNERO', key: 'genero', width: 12 },
      { header: 'FECHA NAC.', key: 'fecha_nacimiento', width: 15 },
      { header: 'TEL. EMERGENCIA', key: 'telefono_emergencia', width: 20 },
      { header: 'CURSO', key: 'nombre_curso', width: 30 },
      { header: 'HORARIO', key: 'horario_curso', width: 15 },
      { header: 'FECHA INS.', key: 'fecha_inscripcion', width: 15 },
      { header: 'ESTADO', key: 'estado_academico', width: 15 },
      { header: 'ESTADO FINAL', key: 'nota_final', width: 15 },
      { header: 'MATRÍCULA', key: 'monto_matricula', width: 15 }
    ];

    // Insertar 3 filas al inicio para encabezados institucionales
    hojaDatos.spliceRows(1, 0, [], [], []);

    // 1. Título del Reporte (Fila 1)
    hojaDatos.mergeCells('A1:O1');
    const titleCell = hojaDatos.getCell('A1');
    titleCell.value = 'REPORTE DE ESTUDIANTES';
    titleCell.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaDatos.getRow(1).height = 25;

    // 2. Info Dinámica (Fila 2)
    hojaDatos.mergeCells('A2:O2');
    const infoCell = hojaDatos.getCell('A2');
    const infoText = `FILTROS: ${filtros.estado ? filtros.estado.toUpperCase() : 'TODOS'} | FECHA INICIO: ${filtros.fechaInicio ? new Date(filtros.fechaInicio).toLocaleDateString() : 'N/A'} | FECHA FIN: ${filtros.fechaFin ? new Date(filtros.fechaFin).toLocaleDateString() : 'N/A'} | GENERADO EL: ${new Date().toLocaleString('es-EC')}`;
    infoCell.value = infoText.toUpperCase();
    infoCell.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hojaDatos.getRow(2).height = 35;

    // Fila 3 vacía

    // 4. Encabezados de Tabla (Ahora en Fila 4)
    hojaDatos.getRow(4).font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
    hojaDatos.getRow(4).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hojaDatos.getRow(4).height = 35;
    // Re-aplicar valores de cabecera si se perdieron o para asegurar (opcional, splice mantiene valores)

    // Agrupar estudiantes por cédula para combinar celdas
    const estudiantesAgrupados = {};
    datos.forEach(est => {
      const key = est.cedula;
      if (!estudiantesAgrupados[key]) {
        estudiantesAgrupados[key] = [];
      }
      estudiantesAgrupados[key].push(est);
    });

    // Ordenar por apellido
    const cedulasOrdenadas = Object.keys(estudiantesAgrupados).sort((a, b) => {
      const apellidoA = estudiantesAgrupados[a][0].apellido || '';
      const apellidoB = estudiantesAgrupados[b][0].apellido || '';
      return apellidoA.localeCompare(apellidoB);
    });

    let currentRowIndex = 5; // Empezar después del header (Fila 4)
    let indiceEstudiante = 1;

    cedulasOrdenadas.forEach(cedula => {
      const cursosEstudiante = estudiantesAgrupados[cedula];
      const startRow = currentRowIndex;

      cursosEstudiante.forEach((estudiante, idx) => {
        // Determinar estado final basado en la nota
        let estadoFinal = 'N/A';
        let colorEstado = 'FF000000'; // Negro por defecto

        const nota = parseFloat(estudiante.nota_final);
        if (!isNaN(nota) && estudiante.nota_final !== null) {
          if (nota >= 7) {
            estadoFinal = 'APROBADO';
            colorEstado = 'FF10B981'; // Verde
          } else {
            estadoFinal = 'REPROBADO';
            colorEstado = 'FFEF4444'; // Rojo
          }
        }

        const row = hojaDatos.addRow({
          indice: indiceEstudiante,
          apellido: estudiante.apellido ? estudiante.apellido.toUpperCase() : '',
          nombre: estudiante.nombre ? estudiante.nombre.toUpperCase() : '',
          cedula: estudiante.cedula,
          email: estudiante.email ? estudiante.email.toLowerCase() : '',
          telefono: estudiante.telefono ? estudiante.telefono.toString() : 'N/A',
          genero: estudiante.genero ? estudiante.genero.toUpperCase() : '',
          fecha_nacimiento: estudiante.fecha_nacimiento ? new Date(estudiante.fecha_nacimiento) : null,
          telefono_emergencia: estudiante.telefono_emergencia ? estudiante.telefono_emergencia.toString().toUpperCase() : 'N/A',
          nombre_curso: estudiante.nombre_curso ? estudiante.nombre_curso.toUpperCase() : '',
          horario_curso: estudiante.horario_curso ? estudiante.horario_curso.toUpperCase() : '',
          fecha_inscripcion: estudiante.fecha_inscripcion ? new Date(estudiante.fecha_inscripcion) : null,
          estado_academico: estudiante.estado_academico?.toUpperCase(),
          nota_final: estadoFinal,
          monto_matricula: estudiante.monto_matricula ? parseFloat(estudiante.monto_matricula) : 0
        });

        // Formatos de celda
        row.getCell('indice').numFmt = '0';
        row.getCell('fecha_nacimiento').numFmt = 'dd/mm/yyyy';
        row.getCell('fecha_inscripcion').numFmt = 'dd/mm/yyyy';
        row.getCell('monto_matricula').numFmt = '$#,##0.00';

        // Aplicar color al estado final (Todo Negro)
        row.getCell('nota_final').font = { color: { argb: 'FF000000' }, bold: true, name: 'Calibri', size: 10 };

        // Color según estado (Todo Negro)
        const estadoCell = row.getCell('estado_academico');
        estadoCell.font = { color: { argb: 'FF000000' }, bold: true, name: 'Calibri', size: 10 };

        currentRowIndex++;
      });

      // Combinar celdas si el estudiante tiene más de un curso
      if (cursosEstudiante.length > 1) {
        const endRow = currentRowIndex - 1;
        // Columnas a combinar: #, Apellido, Nombre, Cedula, Email, Telefono, Genero, Fecha Nac, Direccion
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].forEach(col => {
          hojaDatos.mergeCells(`${col}${startRow}:${col}${endRow}`);
        });
      }

      // Alinear verticalmente al centro y activar ajuste de texto
      for (let r = startRow; r < currentRowIndex; r++) {
        const row = hojaDatos.getRow(r);
        ['indice', 'apellido', 'nombre', 'cedula', 'email', 'telefono', 'genero', 'fecha_nacimiento', 'telefono_emergencia', 'nombre_curso', 'horario_curso', 'fecha_inscripcion', 'estado_academico', 'nota_final', 'monto_matricula'].forEach(key => {
          // Alineación general
          let alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

          // Centrar columnas específicas
          if (['indice', 'cedula', 'genero', 'fecha_nacimiento', 'horario_curso', 'fecha_inscripcion', 'nota_final'].includes(key)) {
            alignment.horizontal = 'center';
          }

          if (row.getCell(key)) {
            row.getCell(key).alignment = alignment;
          }
        });
      }

      indiceEstudiante++;
    });

    // Bordes solo en columnas A-O (15 columnas)
    hojaDatos.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) {
        for (let i = 1; i <= 15; i++) {
          const cell = row.getCell(i);
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
      }
    });




    // HOJA 2: RESUMEN ESTADÍSTICO
    const hojaResumen = workbook.addWorksheet('Resumen', {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Título
    hojaResumen.mergeCells('A1:D1');
    const tituloCell = hojaResumen.getCell('A1');
    tituloCell.value = 'REPORTE ESTADÍSTICO DE ESTUDIANTES';
    tituloCell.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaResumen.getRow(1).height = 25;

    // Subtítulo (Generado el)
    hojaResumen.mergeCells('A2:D2');
    const infoCellResumen = hojaResumen.getCell('A2');
    const infoTextResumen = `GENERADO EL: ${new Date().toLocaleString('es-EC').toUpperCase()}`;
    infoCellResumen.value = infoTextResumen;
    infoCellResumen.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCellResumen.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaResumen.getRow(2).height = 35;

    // Información del período
    hojaResumen.addRow(['PERÍODO DEL REPORTE']);
    hojaResumen.getCell('A3').font = { bold: true, size: 12 };

    const rowDesde = hojaResumen.addRow(['DESDE:', filtros.fechaInicio ? new Date(filtros.fechaInicio) : 'N/A']);
    if (filtros.fechaInicio) rowDesde.getCell(2).numFmt = 'dd/mm/yyyy';

    const rowHasta = hojaResumen.addRow(['HASTA:', filtros.fechaFin ? new Date(filtros.fechaFin) : 'N/A']);
    if (filtros.fechaFin) rowHasta.getCell(2).numFmt = 'dd/mm/yyyy';

    if (filtros.estado && filtros.estado !== 'todos') {
      hojaResumen.addRow(['ESTADO:', filtros.estado.toUpperCase()]);
    }

    // Estadísticas
    hojaResumen.addRow([]);
    hojaResumen.addRow(['RESUMEN GENERAL DE ESTUDIANTES']);
    hojaResumen.getCell('A8').font = { bold: true, size: 12 };

    const stats = [
      ['TOTAL DE ESTUDIANTES', parseInt(estadisticas.total_estudiantes) || 0],
      ['ESTUDIANTES ACTIVOS', parseInt(estadisticas.activos) || 0],
      ['ESTUDIANTES APROBADOS', parseInt(estadisticas.aprobados) || 0],
      ['ESTUDIANTES REPROBADOS', parseInt(estadisticas.reprobados) || 0],
      ['ESTUDIANTES RETIRADOS', parseInt(estadisticas.retirados) || 0],
      ['ESTUDIANTES GRADUADOS', parseInt(estadisticas.graduados) || 0],
      ['PROMEDIO DE NOTAS', estadisticas.promedio_notas ? parseFloat(estadisticas.promedio_notas) : 0]
    ];

    stats.forEach(([label, valor]) => {
      const row = hojaResumen.addRow([label, valor]);
      row.getCell(1).font = { bold: true };
      row.getCell(2).alignment = { horizontal: 'center' };

      if (label === 'PROMEDIO DE NOTAS') {
        row.getCell(2).numFmt = '0.00';
      } else {
        row.getCell(2).numFmt = '0';
      }

      // Color según tipo (Todo Negro)
      row.getCell(2).font = { color: { argb: 'FF000000' }, bold: true, name: 'Calibri', size: 10 };

      // Bordes
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });
    });

    // Ajustar anchos
    hojaResumen.getColumn(1).width = 30;
    hojaResumen.getColumn(2).width = 20;

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  } catch (error) {
    console.error('Error generando Excel de estudiantes:', error);
    throw error;
  }
}
async function generarExcelFinanciero(datos, datosSinFiltroEstado, filtros, estadisticas) {
  try {
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'Sistema SGA Belleza';
    workbook.created = new Date();

    // HOJA 1: DATOS DETALLADOS DE PAGOS (con filtros aplicados)
    const hojaDatos = workbook.addWorksheet('Pagos Detallados', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.3,
          bottom: 0.75,
          header: 0.1,
          footer: 0.3
        },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Configurar columnas optimizadas
    hojaDatos.columns = [
      { header: '#', key: 'indice', width: 6 },
      { header: 'IDENTIFICACIÓN', key: 'cedula_estudiante', width: 20 },
      { header: 'APELLIDOS', key: 'apellidos', width: 25 },
      { header: 'NOMBRES', key: 'nombres', width: 25 },
      { header: 'CURSO', key: 'nombre_curso', width: 30 },
      { header: 'N° CUOTA', key: 'numero_cuota', width: 12 },
      { header: 'MONTO', key: 'monto', width: 12 },
      { header: 'F. PAGO', key: 'fecha_pago', width: 15 },
      { header: 'F. VENC.', key: 'fecha_vencimiento', width: 15 },
      { header: 'MÉTODO', key: 'metodo_pago', width: 15 },
      { header: 'RECIBIDO POR', key: 'recibido_por', width: 30 },
      { header: 'N° COMPROBANTE', key: 'numero_comprobante', width: 20 },
      { header: 'ESTADO', key: 'estado_pago', width: 15 },
      { header: 'VERIFICADO POR', key: 'verificado_por', width: 30 }
    ];

    // Estilo del header
    hojaDatos.getRow(1).font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
    hojaDatos.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    // Insertar 3 filas al inicio
    hojaDatos.spliceRows(1, 0, [], [], []);

    // 1. Título del Reporte (Fila 1)
    hojaDatos.mergeCells('A1:N1');
    const titleCell = hojaDatos.getCell('A1');
    titleCell.value = 'REPORTE FINANCIERO DE PAGOS';
    titleCell.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaDatos.getRow(1).height = 25;

    // 2. Info Dinámica (Fila 2)
    hojaDatos.mergeCells('A2:N2');
    const infoCell = hojaDatos.getCell('A2');
    const infoText = `FILTROS: ${filtros.estado ? filtros.estado.toUpperCase() : 'TODOS'} | FECHA INICIO: ${filtros.fechaInicio ? new Date(filtros.fechaInicio).toLocaleDateString() : 'N/A'} | FECHA FIN: ${filtros.fechaFin ? new Date(filtros.fechaFin).toLocaleDateString() : 'N/A'} | GENERADO EL: ${new Date().toLocaleString('es-EC')}`;
    infoCell.value = infoText.toUpperCase();
    infoCell.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hojaDatos.getRow(2).height = 35;

    // Fila 4: Encabezados
    hojaDatos.getRow(4).font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
    hojaDatos.getRow(4).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hojaDatos.getRow(4).height = 35;

    // Agrupar pagos por cédula
    const pagosAgrupados = {};
    datos.forEach(pago => {
      const key = pago.cedula_estudiante || 'SIN_CEDULA';
      if (!pagosAgrupados[key]) {
        pagosAgrupados[key] = [];
      }
      pagosAgrupados[key].push(pago);
    });

    // Ordenar por apellido
    const cedulasOrdenadas = Object.keys(pagosAgrupados).sort((a, b) => {
      const apellidoA = pagosAgrupados[a][0].apellido_estudiante || '';
      const apellidoB = pagosAgrupados[b][0].apellido_estudiante || '';
      return apellidoA.localeCompare(apellidoB);
    });

    let currentRowIndex = 5; // Empezar después del header (Fila 4)
    let indice = 1;

    cedulasOrdenadas.forEach(cedula => {
      const pagosEstudiante = pagosAgrupados[cedula];
      const startRow = currentRowIndex;

      pagosEstudiante.forEach(pago => {
        // Formatear verificado por: Apellidos, Nombres
        const verificadoPor = pago.verificado_por_apellido && pago.verificado_por_nombre
          ? `${pago.verificado_por_apellido}, ${pago.verificado_por_nombre}`
          : pago.verificado_por_nombre || pago.verificado_por_apellido || 'N/A';

        const row = hojaDatos.addRow({
          indice: indice,
          cedula_estudiante: pago.cedula_estudiante || 'N/A',
          apellidos: pago.apellido_estudiante ? pago.apellido_estudiante.toUpperCase() : 'N/A',
          nombres: pago.nombre_estudiante ? pago.nombre_estudiante.toUpperCase() : 'N/A',
          nombre_curso: pago.nombre_curso ? pago.nombre_curso.toUpperCase() : '',
          numero_cuota: parseInt(pago.numero_cuota) || 0,
          monto: parseFloat(pago.monto) || 0,
          fecha_pago: pago.fecha_pago ? new Date(pago.fecha_pago) : null,
          fecha_vencimiento: pago.fecha_vencimiento ? new Date(pago.fecha_vencimiento) : null,
          metodo_pago: (pago.estado_pago === 'verificado' || pago.estado_pago === 'pagado') && pago.metodo_pago
            ? pago.metodo_pago.toUpperCase()
            : 'N/A',
          recibido_por: pago.recibido_por ? pago.recibido_por.toUpperCase() : 'N/A',
          numero_comprobante: pago.numero_comprobante || 'N/A',
          estado_pago: pago.estado_pago?.toUpperCase() || 'PENDIENTE',
          verificado_por: verificadoPor ? verificadoPor.toUpperCase() : 'N/A'
        });

        // Formatos de celda
        row.getCell('indice').numFmt = '0';
        row.getCell('numero_cuota').numFmt = '0';
        row.getCell('monto').numFmt = '$#,##0.00';

        if (row.getCell('fecha_pago').value) {
          row.getCell('fecha_pago').numFmt = 'dd/mm/yyyy';
        } else {
          row.getCell('fecha_pago').value = 'N/A';
        }

        if (row.getCell('fecha_vencimiento').value) {
          row.getCell('fecha_vencimiento').numFmt = 'dd/mm/yyyy';
        }

        // Color según estado (Todo Negro)
        const estadoCell = row.getCell('estado_pago');
        estadoCell.font = { color: { argb: 'FF000000' }, bold: true, name: 'Calibri', size: 10 };

        // Alineación y text wrapping
        ['indice', 'cedula_estudiante', 'apellidos', 'nombres', 'nombre_curso', 'numero_cuota', 'monto', 'fecha_pago', 'fecha_vencimiento', 'metodo_pago', 'recibido_por', 'numero_comprobante', 'estado_pago', 'verificado_por'].forEach(key => {
          let alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

          if (['indice', 'cedula_estudiante', 'numero_cuota', 'monto', 'fecha_pago', 'fecha_vencimiento', 'metodo_pago', 'estado_pago'].includes(key)) {
            alignment.horizontal = 'center';
          }

          row.getCell(key).alignment = alignment;

          // Estilo base negro
          row.getCell(key).font = { color: { argb: 'FF000000' }, name: 'Calibri', size: 10 };
        });

        currentRowIndex++;
      });

      // COMBINAR CELDAS POR ESTUDIANTE (ya existente)
      if (pagosEstudiante.length > 1) {
        const endRow = currentRowIndex - 1;
        // Columnas: #, Cédula, Apellidos, Nombres
        ['A', 'B', 'C', 'D'].forEach(col => {
          hojaDatos.mergeCells(`${col}${startRow}:${col}${endRow}`);
        });
      }

      // COMBINAR CELDAS POR COMPROBANTE (nuevo)
      // Agrupar pagos consecutivos con el mismo comprobante
      let i = 0;
      while (i < pagosEstudiante.length) {
        const pagoActual = pagosEstudiante[i];
        const comprobanteActual = pagoActual.numero_comprobante;

        // Solo combinar si tiene comprobante válido
        if (comprobanteActual && comprobanteActual !== 'N/A' && comprobanteActual.trim() !== '') {
          let j = i + 1;

          // Buscar cuántos pagos consecutivos tienen el mismo comprobante
          while (j < pagosEstudiante.length && pagosEstudiante[j].numero_comprobante === comprobanteActual) {
            j++;
          }

          // Si hay más de un pago con el mismo comprobante, combinar celdas
          if (j - i > 1) {
            const rowInicio = startRow + i;
            const rowFin = startRow + j - 1;

            // Combinar: Método de Pago (J), Recibido Por (K), Número Comprobante (L)
            hojaDatos.mergeCells(`J${rowInicio}:J${rowFin}`); // metodo_pago
            hojaDatos.mergeCells(`K${rowInicio}:K${rowFin}`); // recibido_por
            hojaDatos.mergeCells(`L${rowInicio}:L${rowFin}`); // numero_comprobante
          }

          i = j;
        } else {
          i++;
        }
      }

      indice++;
    });

    // Bordes solo en columnas A-N (14 columnas)
    hojaDatos.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) {
        for (let i = 1; i <= 14; i++) {
          const cell = row.getCell(i);
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
      }
    });




    // HOJA 2: ESTADO DE CUENTA POR ESTUDIANTE (con TODOS los datos, sin filtro de estado)
    const hojaEstadoCuenta = workbook.addWorksheet('Estado de Cuenta', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.2,
          right: 0.2,
          top: 0.4,
          bottom: 0.4,
          header: 0.3,
          footer: 0.3
        },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    hojaEstadoCuenta.columns = [
      { header: '#', key: 'indice', width: 5 },
      { header: 'IDENTIFICACIÓN', key: 'cedula', width: 20 },
      { header: 'APELLIDOS', key: 'apellidos', width: 18 },
      { header: 'NOMBRES', key: 'nombres', width: 18 },
      { header: 'CURSO', key: 'curso', width: 25 },
      { header: 'TOTAL', key: 'total', width: 12 },
      { header: 'VERIFICADAS', key: 'verificadas', width: 13 },
      { header: 'PAGADAS', key: 'pagadas', width: 11 },
      { header: 'PAGADO', key: 'pagado', width: 12 },
      { header: 'PENDIENTES', key: 'pendientes', width: 13 },
      { header: 'SALDO', key: 'saldo', width: 12 },
      { header: '% PAGADO', key: 'porcentaje', width: 11 },
      { header: 'ESTADO', key: 'estado', width: 13 }
    ];

    // Insertar 3 filas al inicio para encabezados institucionales
    hojaEstadoCuenta.spliceRows(1, 0, [], [], []);

    // 1. Título del Reporte (Fila 1)
    hojaEstadoCuenta.mergeCells('A1:M1');
    const titleCellEC = hojaEstadoCuenta.getCell('A1');
    titleCellEC.value = 'ESTADO DE CUENTA POR ESTUDIANTE';
    titleCellEC.font = { bold: true, size: 14, color: { argb: 'FF000000' }, name: 'Calibri' };
    titleCellEC.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaEstadoCuenta.getRow(1).height = 30;

    // 2. Info Dinámica (Fila 2)
    hojaEstadoCuenta.mergeCells('A2:M2');
    const infoCellEC = hojaEstadoCuenta.getCell('A2');
    const infoTextEC = `FILTROS: ${filtros.fechaInicio ? new Date(filtros.fechaInicio).toLocaleDateString() : 'N/A'} - ${filtros.fechaFin ? new Date(filtros.fechaFin).toLocaleDateString() : 'N/A'} | GENERADO EL: ${new Date().toLocaleString('es-EC')}`;
    infoCellEC.value = infoTextEC;
    infoCellEC.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCellEC.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaEstadoCuenta.getRow(2).height = 30;

    // Fila 4: Encabezados (Estilos)
    hojaEstadoCuenta.getRow(4).font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
    hojaEstadoCuenta.getRow(4).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hojaEstadoCuenta.getRow(4).height = 35;

    // Agrupar datos SIN FILTRO DE ESTADO por estudiante
    const estudiantesPorCedula = {};
    datosSinFiltroEstado.forEach(pago => {
      const cedula = pago.cedula_estudiante || 'SIN_CEDULA';
      if (!estudiantesPorCedula[cedula]) {
        estudiantesPorCedula[cedula] = {
          cedula: pago.cedula_estudiante,
          apellidos: pago.apellido_estudiante,
          nombres: pago.nombre_estudiante,
          curso: pago.nombre_curso,
          pagos: []
        };
      }
      estudiantesPorCedula[cedula].pagos.push(pago);
    });

    // Procesar cada estudiante
    let indiceEstadoCuenta = 1;
    let currentRowEC = 5; // Empezar después del header (Fila 4)

    Object.values(estudiantesPorCedula).forEach(estudiante => {
      const totalPagos = estudiante.pagos.length;
      const cuotasVerificadas = estudiante.pagos.filter(p => p.estado_pago === 'verificado').length;
      const cuotasPagadas = estudiante.pagos.filter(p => p.estado_pago === 'pagado').length;
      const cuotasPendientes = estudiante.pagos.filter(p => p.estado_pago === 'pendiente' || p.estado_pago === 'vencido').length;

      const totalAPagar = estudiante.pagos.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
      const montoPagado = estudiante.pagos
        .filter(p => p.estado_pago === 'verificado')
        .reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
      const saldoPendiente = totalAPagar - montoPagado;
      const porcentajePagado = totalAPagar > 0 ? (montoPagado / totalAPagar) * 100 : 0;

      let estado = 'AL DÍA';
      if (saldoPendiente > 0) {
        const cuotasVencidas = estudiante.pagos.filter(p => {
          if (p.estado_pago !== 'verificado' && p.fecha_vencimiento) {
            return new Date(p.fecha_vencimiento) < new Date();
          }
          return false;
        }).length;

        if (cuotasVencidas > 0) {
          estado = 'VENCIDO';
        } else {
          estado = 'PENDIENTE';
        }
      }

      const row = hojaEstadoCuenta.getRow(currentRowEC);
      row.values = {
        indice: indiceEstadoCuenta++,
        cedula: estudiante.cedula || 'N/A',
        apellidos: estudiante.apellidos || 'N/A',
        nombres: estudiante.nombres || 'N/A',
        curso: estudiante.curso ? estudiante.curso.toUpperCase() : 'N/A',
        total: totalAPagar,
        verificadas: cuotasVerificadas,
        pagadas: cuotasPagadas,
        pagado: montoPagado,
        pendientes: cuotasPendientes,
        saldo: saldoPendiente,
        porcentaje: porcentajePagado,
        estado: estado
      };
      currentRowEC++;

      // Formatos de celda
      row.getCell('indice').numFmt = '0';
      row.getCell('total').numFmt = '$#,##0.00';
      row.getCell('verificadas').numFmt = '0';
      row.getCell('pagadas').numFmt = '0';
      row.getCell('pagado').numFmt = '$#,##0.00';
      row.getCell('pendientes').numFmt = '0';
      row.getCell('saldo').numFmt = '$#,##0.00';
      row.getCell('porcentaje').numFmt = '0.0"%"';

      // Alineación y text wrapping
      ['indice', 'cedula', 'apellidos', 'nombres', 'curso', 'total', 'verificadas', 'pagadas', 'pagado', 'pendientes', 'saldo', 'porcentaje', 'estado'].forEach(key => {
        let alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

        if (['indice', 'cedula', 'total', 'verificadas', 'pagadas', 'pagado', 'pendientes', 'saldo', 'porcentaje', 'estado'].includes(key)) {
          alignment.horizontal = 'center';
        }

        row.getCell(key).alignment = alignment;
      });

      // Colores según estado (Todo Negro)
      const estadoCell = row.getCell('estado');
      estadoCell.font = { color: { argb: 'FF000000' }, bold: true, name: 'Calibri', size: 10 };

      const porcentajeCell = row.getCell('porcentaje');
      porcentajeCell.font = { color: { argb: 'FF000000' }, bold: true, name: 'Calibri', size: 10 };
    });

    // Bordes solo en columnas A-M (13 columnas)
    hojaEstadoCuenta.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) {
        for (let i = 1; i <= 13; i++) {
          const cell = row.getCell(i);
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
      }
    });




    // HOJA 3: RESUMEN FINANCIERO
    const hojaResumen = workbook.addWorksheet('Resumen Financiero', {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    hojaResumen.mergeCells('A1:D1');
    const tituloCell = hojaResumen.getCell('A1');
    tituloCell.value = 'REPORTE ESTADÍSTICO FINANCIERO';
    tituloCell.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaResumen.getRow(1).height = 25;

    // Subtítulo (Generado el)
    hojaResumen.mergeCells('A2:D2');
    const infoCellResumenFin = hojaResumen.getCell('A2');
    const infoTextResumenFin = `GENERADO EL: ${new Date().toLocaleString('es-EC').toUpperCase()}`;
    infoCellResumenFin.value = infoTextResumenFin;
    infoCellResumenFin.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCellResumenFin.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaResumen.getRow(2).height = 35;

    hojaResumen.addRow(['PERÍODO DEL REPORTE']);
    hojaResumen.getCell('A3').font = { bold: true, size: 12 };

    const rowDesde = hojaResumen.addRow(['DESDE:', filtros.fechaInicio ? new Date(filtros.fechaInicio) : 'N/A']);
    if (filtros.fechaInicio) rowDesde.getCell(2).numFmt = 'dd/mm/yyyy';

    const rowHasta = hojaResumen.addRow(['HASTA:', filtros.fechaFin ? new Date(filtros.fechaFin) : 'N/A']);
    if (filtros.fechaFin) rowHasta.getCell(2).numFmt = 'dd/mm/yyyy';

    hojaResumen.addRow([]);
    hojaResumen.addRow(['RESUMEN GENERAL FINANCIERO']);
    hojaResumen.getCell('A7').font = { bold: true, size: 12 };

    const stats = [
      ['TOTAL DE PAGOS', parseInt(estadisticas.total_pagos) || 0],
      ['PAGOS REALIZADOS', parseInt(estadisticas.pagos_realizados) || 0],
      ['PAGOS VERIFICADOS', parseInt(estadisticas.pagos_verificados) || 0],
      ['PAGOS PENDIENTES', parseInt(estadisticas.pagos_pendientes) || 0],
      ['PAGOS VENCIDOS', parseInt(estadisticas.pagos_vencidos) || 0],
      ['INGRESOS TOTALES', parseFloat(estadisticas.ingresos_totales) || 0],
      ['INGRESOS PENDIENTES', parseFloat(estadisticas.ingresos_pendientes) || 0],
      ['PROMEDIO POR PAGO', parseFloat(estadisticas.promedio_pago) || 0],
      ['MATRÍCULAS PAGADAS', parseInt(estadisticas.matriculas_pagadas) || 0],
      ['ESTUDIANTES CON SALDO', Object.values(estudiantesPorCedula).filter(e => {
        const saldo = e.pagos.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0) -
          e.pagos.filter(p => p.estado_pago === 'verificado').reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
        return saldo > 0;
      }).length]
    ];

    stats.forEach(([label, valor]) => {
      const row = hojaResumen.addRow([label, valor]);
      row.getCell(1).font = { bold: true };
      row.getCell(2).alignment = { horizontal: 'center' };

      // Aplicar formatos según el tipo de dato
      if (label.includes('INGRESOS') || label.includes('PROMEDIO')) {
        row.getCell(2).numFmt = '$#,##0.00';
      } else {
        row.getCell(2).numFmt = '0';
      }

      if (label.includes('INGRESOS TOTALES')) {
        row.getCell(2).font = { color: { argb: 'FF000000' }, bold: true, size: 14, name: 'Calibri' };
      } else {
        row.getCell(2).font = { color: { argb: 'FF000000' }, bold: true, size: 10, name: 'Calibri' };
      }

      // Bordes
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });
    });

    hojaResumen.getColumn(1).width = 30;
    hojaResumen.getColumn(2).width = 20;

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  } catch (error) {
    console.error('Error generando Excel financiero:', error);
    throw error;
  }
}


/**
 * GENERAR EXCEL - REPORTE DE CURSOS MEJORADO
 */
async function generarExcelCursos(datos, filtros, estadisticas) {
  try {
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'Sistema SGA Belleza';
    workbook.created = new Date();
    workbook.modified = new Date();

    // HOJA 1: CURSOS DETALLADOS
    const hojaCursos = workbook.addWorksheet('Cursos', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.2,
          right: 0.2,
          top: 0.4,
          bottom: 0.4,
          header: 0.3,
          footer: 0.3
        },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Configurar columnas optimizadas para impresión (con índice)
    hojaCursos.columns = [
      { header: '#', key: 'indice', width: 7 },
      { header: 'CÓDIGO', key: 'codigo', width: 15 },
      { header: 'NOMBRE CURSO', key: 'nombre', width: 35 },
      { header: 'ID DOCENTE', key: 'docente_identificacion', width: 20 },
      { header: 'DOCENTE', key: 'docente', width: 35 },
      { header: 'HORARIO', key: 'turno', width: 15 }, // Será sobrescrito por merge
      { header: '', key: 'intervalo', width: 15 },    // Será sobrescrito por merge
      { header: 'CAPACIDAD', key: 'capacidad', width: 12 },
      { header: 'INSCRITOS', key: 'inscritos', width: 12 },
      { header: 'OCUPACIÓN %', key: 'ocupacion', width: 15 },
      { header: 'ESTADO', key: 'estado', width: 15 },
      { header: 'AULA', key: 'aula', width: 15 },
      { header: 'FECHA INICIO', key: 'fechaInicio', width: 15 },
      { header: 'FECHA FIN', key: 'fechaFin', width: 15 }
    ];

    // Insertar 3 filas al inicio
    hojaCursos.spliceRows(1, 0, [], [], []);

    // 1. Título del Reporte (Fila 1)
    hojaCursos.mergeCells('A1:N1');
    const titleCell = hojaCursos.getCell('A1');
    titleCell.value = 'REPORTE DE CURSOS';
    titleCell.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaCursos.getRow(1).height = 25;

    // 2. Info Dinámica (Fila 2)
    hojaCursos.mergeCells('A2:N2');
    const infoCell = hojaCursos.getCell('A2');
    const infoText = `FILTROS: ${filtros.estado ? filtros.estado.toUpperCase() : 'TODOS'} | FECHA INICIO: ${filtros.fechaInicio ? new Date(filtros.fechaInicio).toLocaleDateString() : 'N/A'} | FECHA FIN: ${filtros.fechaFin ? new Date(filtros.fechaFin).toLocaleDateString() : 'N/A'} | GENERADO EL: ${new Date().toLocaleString('es-EC')}`;
    infoCell.value = infoText.toUpperCase();
    infoCell.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hojaCursos.getRow(2).height = 35;

    // Fila 4: Encabezados
    hojaCursos.getRow(4).font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
    hojaCursos.getRow(4).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hojaCursos.getRow(4).height = 35;

    // Fusionar encabezados de Horario (F4:G4) - Movido una columna a la derecha por la nueva columna de docente_identificacion
    // El título "HORARIO" quedará centrado sobre las columnas de Turno e Intervalo
    hojaCursos.mergeCells('F4:G4');
    const horarioHeader = hojaCursos.getCell('F4');
    horarioHeader.value = 'HORARIO';
    horarioHeader.alignment = { vertical: 'middle', horizontal: 'center' };
    horarioHeader.font = { bold: true, color: { argb: 'FF000000' }, size: 10, name: 'Calibri' };
    horarioHeader.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    // Agregar datos
    let indice = 1;
    datos.forEach(curso => {
      // Formatear nombre del docente: Apellidos, Nombres
      const docenteNombre = curso.docente_nombres && curso.docente_apellidos
        ? `${curso.docente_apellidos}, ${curso.docente_nombres}`
        : curso.docente_nombres || curso.docente_apellidos || 'N/A';

      // Formatear Intervalo: "08:00 - 12:00"
      let intervaloTexto = 'N/A';
      if (curso.hora_inicio && curso.hora_fin) {
        // Asumiendo formato HH:MM:SS, tomamos los primeros 5 caracteres
        const inicio = curso.hora_inicio.toString().substring(0, 5);
        const fin = curso.hora_fin.toString().substring(0, 5);
        intervaloTexto = `${inicio} - ${fin}`;
      }

      const row = hojaCursos.addRow({
        indice: indice++,
        codigo: curso.codigo_curso ? curso.codigo_curso.toString().toUpperCase() : 'N/A',
        nombre: curso.nombre_curso ? curso.nombre_curso.toUpperCase() : '',
        docente_identificacion: curso.docente_identificacion || 'N/A',
        docente: docenteNombre ? docenteNombre.toUpperCase() : 'N/A',
        turno: curso.horario ? curso.horario.toUpperCase() : 'N/A',
        intervalo: intervaloTexto,
        capacidad: parseInt(curso.capacidad_maxima) || 0,
        inscritos: parseInt(curso.total_estudiantes) || 0,
        ocupacion: parseFloat(curso.porcentaje_ocupacion) || 0,
        estado: curso.estado ? curso.estado.toUpperCase() : 'ACTIVO',
        aula: curso.aula_nombre ? curso.aula_nombre.toUpperCase() : 'N/A',
        fechaInicio: curso.fecha_inicio ? new Date(curso.fecha_inicio) : null,
        fechaFin: curso.fecha_fin ? new Date(curso.fecha_fin) : null
      });

      // Formatos de celda
      row.getCell('indice').numFmt = '0';
      row.getCell('capacidad').numFmt = '0';
      row.getCell('inscritos').numFmt = '0';
      row.getCell('ocupacion').numFmt = '0.0"%"';

      if (row.getCell('fechaInicio').value) {
        row.getCell('fechaInicio').numFmt = 'dd/mm/yyyy';
      }
      if (row.getCell('fechaFin').value) {
        row.getCell('fechaFin').numFmt = 'dd/mm/yyyy';
      }

      // Color según ocupación (Todo Negro)
      const ocupacionCell = row.getCell('ocupacion');
      ocupacionCell.font = { color: { argb: 'FF000000' }, bold: true, name: 'Calibri', size: 10 };

      // Color según estado (Todo Negro)
      const estadoCell = row.getCell('estado');
      estadoCell.font = { color: { argb: 'FF000000' }, bold: true, name: 'Calibri', size: 10 };

      // Alineación y text wrapping
      ['indice', 'codigo', 'nombre', 'docente_identificacion', 'docente', 'turno', 'intervalo', 'capacidad', 'inscritos', 'ocupacion', 'estado', 'aula', 'fechaInicio', 'fechaFin'].forEach(key => {
        // Alineación general
        let alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

        // Centrar columnas específicas
        if (['indice', 'codigo', 'docente_identificacion', 'capacidad', 'inscritos', 'ocupacion', 'estado', 'aula', 'fechaInicio', 'fechaFin', 'turno', 'intervalo'].includes(key)) {
          alignment.horizontal = 'center';
        }

        row.getCell(key).alignment = alignment;
      });
    });

    // Bordes a todas las celdas de la tabla (solo columnas A-N)
    hojaCursos.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) {
        for (let i = 1; i <= 14; i++) { // Hasta columna N
          const cell = row.getCell(i);
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
      }
    });



    // HOJA 2: ESTADÍSTICAS
    const hojaStats = workbook.addWorksheet('Estadísticas', {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.75, header: 0.1, footer: 0.3 },
        printTitlesRow: '1:4'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Título
    hojaStats.mergeCells('A1:D1');
    const tituloCell = hojaStats.getCell('A1');
    tituloCell.value = 'REPORTE DE CURSOS - ESTADÍSTICAS';
    tituloCell.font = { bold: true, size: 12, color: { argb: 'FF000000' }, name: 'Calibri' };
    tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaStats.getRow(1).height = 25;

    // Subtítulo (Generado el)
    hojaStats.mergeCells('A2:D2');
    const infoCellStats = hojaStats.getCell('A2');
    const infoTextStats = `GENERADO EL: ${new Date().toLocaleString('es-EC').toUpperCase()}`;
    infoCellStats.value = infoTextStats;
    infoCellStats.font = { size: 10, color: { argb: 'FF000000' }, name: 'Calibri' };
    infoCellStats.alignment = { horizontal: 'center', vertical: 'middle' };
    hojaStats.getRow(2).height = 35;

    // Información del período
    hojaStats.addRow(['PERÍODO DEL REPORTE']);
    hojaStats.getCell('A3').font = { bold: true, size: 12 };

    if (filtros.fechaInicio) {
      const rowDesde = hojaStats.addRow(['DESDE:', new Date(filtros.fechaInicio)]);
      rowDesde.getCell(2).numFmt = 'dd/mm/yyyy';
    }

    if (filtros.fechaFin) {
      const rowHasta = hojaStats.addRow(['HASTA:', new Date(filtros.fechaFin)]);
      rowHasta.getCell(2).numFmt = 'dd/mm/yyyy';
    }

    // Estadísticas
    hojaStats.addRow([]);
    hojaStats.addRow(['ESTADÍSTICAS GENERALES']);
    hojaStats.getCell('A7').font = { bold: true, size: 12 };

    const stats = [
      ['TOTAL DE CURSOS', parseInt(estadisticas.total_cursos) || 0],
      ['CURSOS ACTIVOS', parseInt(estadisticas.cursos_activos) || 0],
      ['TOTAL ESTUDIANTES INSCRITOS', parseInt(estadisticas.total_estudiantes_inscritos) || 0],
      ['PROMEDIO DE OCUPACIÓN', estadisticas.promedio_ocupacion ? parseFloat(estadisticas.promedio_ocupacion) : 0]
    ];

    stats.forEach(([label, valor]) => {
      const row = hojaStats.addRow([label, valor]);
      row.getCell(1).font = { bold: true };
      row.getCell(2).alignment = { horizontal: 'center' };

      // Formato para promedio de ocupación
      if (label === 'Promedio de Ocupación') {
        row.getCell(2).numFmt = '0.0"%"';
      } else {
        row.getCell(2).numFmt = '0';
      }

      // Color según tipo (Todo Negro)
      if (label.includes('Activos')) {
        row.getCell(2).font = { color: { argb: 'FF000000' }, bold: true, name: 'Calibri', size: 10 };
      } else {
        row.getCell(2).font = { color: { argb: 'FF000000' }, bold: true, name: 'Calibri', size: 10 };
      }

      // Bordes
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });
    });

    // Ajustar anchos
    hojaStats.getColumn(1).width = 30;
    hojaStats.getColumn(2).width = 20;

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  } catch (error) {
    console.error('Error generando Excel de cursos:', error);
    throw error;
  }
}

module.exports = {
  generarExcelEstudiantes,
  generarExcelFinanciero,
  generarExcelCursos
};
