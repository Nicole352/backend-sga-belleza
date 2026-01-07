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
      properties: { tabColor: { argb: 'FFFBBF24' } },
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0, // 0 significa automático
        margins: {
          left: 0.2,
          right: 0.2,
          top: 0.4,
          bottom: 0.4,
          header: 0.3,
          footer: 0.3
        },
        printTitlesRow: '1:1'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Configurar columnas con anchos optimizados para impresión
    hojaDatos.columns = [
      { header: '#', key: 'indice', width: 4 },
      { header: 'APELLIDOS', key: 'apellido', width: 15 },
      { header: 'NOMBRES', key: 'nombre', width: 15 },
      { header: 'CÉDULA', key: 'cedula', width: 12 },
      { header: 'EMAIL', key: 'email', width: 25 },
      { header: 'TELÉFONO', key: 'telefono', width: 12 },
      { header: 'GÉNERO', key: 'genero', width: 10 },
      { header: 'FECHA NAC.', key: 'fecha_nacimiento', width: 12 },
      { header: 'DIRECCIÓN', key: 'direccion', width: 25 },
      { header: 'CURSO', key: 'nombre_curso', width: 20 },
      { header: 'HORARIO', key: 'horario_curso', width: 10 },
      { header: 'FECHA INS.', key: 'fecha_inscripcion', width: 12 },
      { header: 'ESTADO', key: 'estado_academico', width: 12 },
      { header: 'ESTADO FINAL', key: 'nota_final', width: 15 },
      { header: 'MATRÍCULA', key: 'monto_matricula', width: 12 }
    ];

    // Estilo del header
    hojaDatos.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    hojaDatos.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFBBF24' }
    };
    hojaDatos.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hojaDatos.getRow(1).height = 35;

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

    let currentRowIndex = 2; // Empezar después del header
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
          apellido: estudiante.apellido,
          nombre: estudiante.nombre,
          cedula: estudiante.cedula,
          email: estudiante.email,
          telefono: estudiante.telefono,
          genero: estudiante.genero,
          fecha_nacimiento: estudiante.fecha_nacimiento ? new Date(estudiante.fecha_nacimiento) : null,
          direccion: estudiante.direccion || 'N/A',
          nombre_curso: estudiante.nombre_curso,
          horario_curso: estudiante.horario_curso,
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

        // Aplicar color al estado final
        row.getCell('nota_final').font = { color: { argb: colorEstado }, bold: true };

        // Color según estado
        const estadoCell = row.getCell('estado_academico');
        if (estudiante.estado_academico === 'aprobado') {
          estadoCell.font = { color: { argb: 'FF10B981' }, bold: true };
        } else if (estudiante.estado_academico === 'reprobado') {
          estadoCell.font = { color: { argb: 'FFEF4444' }, bold: true };
        } else if (estudiante.estado_academico === 'retirado') {
          estadoCell.font = { color: { argb: 'FFF59E0B' }, bold: true };
        }

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
        ['indice', 'apellido', 'nombre', 'cedula', 'email', 'telefono', 'genero', 'fecha_nacimiento', 'direccion', 'nombre_curso', 'horario_curso', 'fecha_inscripcion', 'estado_academico', 'nota_final', 'monto_matricula'].forEach(key => {
          // Alineación general
          let alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

          // Centrar columnas específicas
          if (['indice', 'cedula', 'genero', 'fecha_nacimiento', 'horario_curso', 'fecha_inscripcion', 'nota_final'].includes(key)) {
            alignment.horizontal = 'center';
          }

          row.getCell(key).alignment = alignment;
        });
      }

      indiceEstudiante++;
    });

    // Bordes a todas las celdas
    hojaDatos.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          left: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          right: { style: 'thin', color: { argb: 'FFE5E5E5' } }
        };
      });
    });

    // Filtros automáticos
    hojaDatos.autoFilter = {
      from: 'A1',
      to: 'O1'
    };


    // HOJA 2: RESUMEN ESTADÍSTICO
    const hojaResumen = workbook.addWorksheet('Resumen', {
      properties: { tabColor: { argb: 'FF10B981' } }
    });

    // Título
    hojaResumen.mergeCells('A1:D1');
    const tituloCell = hojaResumen.getCell('A1');
    tituloCell.value = 'REPORTE DE ESTUDIANTES - RESUMEN';
    tituloCell.font = { bold: true, size: 16, color: { argb: 'FF000000' } };
    tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
    tituloCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFBBF24' }
    };
    hojaResumen.getRow(1).height = 30;

    // Información del período
    hojaResumen.addRow([]);
    hojaResumen.addRow(['PERÍODO DEL REPORTE']);
    hojaResumen.getCell('A3').font = { bold: true, size: 12 };

    const rowDesde = hojaResumen.addRow(['Desde:', filtros.fechaInicio ? new Date(filtros.fechaInicio) : 'N/A']);
    if (filtros.fechaInicio) rowDesde.getCell(2).numFmt = 'dd/mm/yyyy';

    const rowHasta = hojaResumen.addRow(['Hasta:', filtros.fechaFin ? new Date(filtros.fechaFin) : 'N/A']);
    if (filtros.fechaFin) rowHasta.getCell(2).numFmt = 'dd/mm/yyyy';

    if (filtros.estado && filtros.estado !== 'todos') {
      hojaResumen.addRow(['Estado:', filtros.estado.toUpperCase()]);
    }

    // Estadísticas
    hojaResumen.addRow([]);
    hojaResumen.addRow(['ESTADÍSTICAS GENERALES']);
    hojaResumen.getCell('A8').font = { bold: true, size: 12 };

    const stats = [
      ['Total de Estudiantes', parseInt(estadisticas.total_estudiantes) || 0],
      ['Estudiantes Activos', parseInt(estadisticas.activos) || 0],
      ['Estudiantes Aprobados', parseInt(estadisticas.aprobados) || 0],
      ['Estudiantes Reprobados', parseInt(estadisticas.reprobados) || 0],
      ['Estudiantes Retirados', parseInt(estadisticas.retirados) || 0],
      ['Estudiantes Graduados', parseInt(estadisticas.graduados) || 0],
      ['Promedio de Notas', estadisticas.promedio_notas ? parseFloat(estadisticas.promedio_notas) : 0]
    ];

    stats.forEach(([label, valor]) => {
      const row = hojaResumen.addRow([label, valor]);
      row.getCell(1).font = { bold: true };
      row.getCell(2).alignment = { horizontal: 'center' };

      if (label === 'Promedio de Notas') {
        row.getCell(2).numFmt = '0.00';
      } else {
        row.getCell(2).numFmt = '0';
      }

      // Color según tipo
      if (label.includes('Aprobados')) {
        row.getCell(2).font = { color: { argb: 'FF10B981' }, bold: true };
      } else if (label.includes('Reprobados')) {
        row.getCell(2).font = { color: { argb: 'FFEF4444' }, bold: true };
      } else if (label.includes('Retirados')) {
        row.getCell(2).font = { color: { argb: 'FFF59E0B' }, bold: true };
      }
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
      properties: { tabColor: { argb: 'FF10B981' } },
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
        printTitlesRow: '1:1'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Configurar columnas optimizadas
    hojaDatos.columns = [
      { header: '#', key: 'indice', width: 5 },
      { header: 'CÉDULA', key: 'cedula_estudiante', width: 13 },
      { header: 'APELLIDOS', key: 'apellidos', width: 18 },
      { header: 'NOMBRES', key: 'nombres', width: 18 },
      { header: 'CURSO', key: 'nombre_curso', width: 25 },
      { header: 'N° CUOTA', key: 'numero_cuota', width: 10 },
      { header: 'MONTO', key: 'monto', width: 12 },
      { header: 'F. PAGO', key: 'fecha_pago', width: 12 },
      { header: 'F. VENC.', key: 'fecha_vencimiento', width: 12 },
      { header: 'MÉTODO', key: 'metodo_pago', width: 13 },
      { header: 'RECIBIDO POR', key: 'recibido_por', width: 25 },
      { header: 'N° COMPROBANTE', key: 'numero_comprobante', width: 17 },
      { header: 'ESTADO', key: 'estado_pago', width: 13 },
      { header: 'VERIFICADO POR', key: 'verificado_por', width: 25 }
    ];

    // Estilo del header
    hojaDatos.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    hojaDatos.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF10B981' }
    };
    hojaDatos.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hojaDatos.getRow(1).height = 30;

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

    let currentRowIndex = 2;
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
          apellidos: pago.apellido_estudiante || 'N/A',
          nombres: pago.nombre_estudiante || 'N/A',
          nombre_curso: pago.nombre_curso,
          numero_cuota: parseInt(pago.numero_cuota) || 0,
          monto: parseFloat(pago.monto) || 0,
          fecha_pago: pago.fecha_pago ? new Date(pago.fecha_pago) : null,
          fecha_vencimiento: pago.fecha_vencimiento ? new Date(pago.fecha_vencimiento) : null,
          metodo_pago: (pago.estado_pago === 'verificado' || pago.estado_pago === 'pagado') && pago.metodo_pago
            ? pago.metodo_pago.toUpperCase()
            : 'N/A',
          recibido_por: pago.recibido_por || 'N/A',
          numero_comprobante: pago.numero_comprobante || 'N/A',
          estado_pago: pago.estado_pago?.toUpperCase() || 'PENDIENTE',
          verificado_por: verificadoPor
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

        // Color según estado
        const estadoCell = row.getCell('estado_pago');
        if (pago.estado_pago === 'verificado') {
          estadoCell.font = { color: { argb: 'FF10B981' }, bold: true };
        } else if (pago.estado_pago === 'pendiente' || pago.estado_pago === 'vencido') {
          estadoCell.font = { color: { argb: 'FFEF4444' }, bold: true };
        } else if (pago.estado_pago === 'pagado') {
          estadoCell.font = { color: { argb: 'FF3B82F6' }, bold: true };
        }

        // Alineación y text wrapping
        ['indice', 'cedula_estudiante', 'apellidos', 'nombres', 'nombre_curso', 'numero_cuota', 'monto', 'fecha_pago', 'fecha_vencimiento', 'metodo_pago', 'recibido_por', 'numero_comprobante', 'estado_pago', 'verificado_por'].forEach(key => {
          let alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

          if (['indice', 'cedula_estudiante', 'numero_cuota', 'monto', 'fecha_pago', 'fecha_vencimiento', 'metodo_pago', 'estado_pago'].includes(key)) {
            alignment.horizontal = 'center';
          }

          row.getCell(key).alignment = alignment;
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

    // Bordes a todas las celdas
    hojaDatos.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          left: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          right: { style: 'thin', color: { argb: 'FFE5E5E5' } }
        };
      });
    });

    hojaDatos.autoFilter = {
      from: 'A1',
      to: 'N1'
    };


    // HOJA 2: ESTADO DE CUENTA POR ESTUDIANTE (con TODOS los datos, sin filtro de estado)
    const hojaEstadoCuenta = workbook.addWorksheet('Estado de Cuenta', {
      properties: { tabColor: { argb: 'FF3B82F6' } }
    });

    hojaEstadoCuenta.columns = [
      { header: '#', key: 'indice', width: 5 },
      { header: 'CÉDULA', key: 'cedula', width: 13 },
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

    hojaEstadoCuenta.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    hojaEstadoCuenta.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3B82F6' }
    };
    hojaEstadoCuenta.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hojaEstadoCuenta.getRow(1).height = 30;

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

      const row = hojaEstadoCuenta.addRow({
        indice: indiceEstadoCuenta++,
        cedula: estudiante.cedula || 'N/A',
        apellidos: estudiante.apellidos || 'N/A',
        nombres: estudiante.nombres || 'N/A',
        curso: estudiante.curso,
        total: totalAPagar,
        verificadas: cuotasVerificadas,
        pagadas: cuotasPagadas,
        pagado: montoPagado,
        pendientes: cuotasPendientes,
        saldo: saldoPendiente,
        porcentaje: porcentajePagado,
        estado: estado
      });

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

      // Colores según estado
      const estadoCell = row.getCell('estado');
      if (estado === 'AL DÍA') {
        estadoCell.font = { color: { argb: 'FF10B981' }, bold: true };
      } else if (estado === 'VENCIDO') {
        estadoCell.font = { color: { argb: 'FFEF4444' }, bold: true };
      } else if (estado === 'PENDIENTE') {
        estadoCell.font = { color: { argb: 'FFF59E0B' }, bold: true };
      }

      const porcentajeCell = row.getCell('porcentaje');
      if (porcentajePagado >= 100) {
        porcentajeCell.font = { color: { argb: 'FF10B981' }, bold: true };
      } else if (porcentajePagado >= 50) {
        porcentajeCell.font = { color: { argb: 'FFF59E0B' }, bold: true };
      } else {
        porcentajeCell.font = { color: { argb: 'FFEF4444' }, bold: true };
      }
    });

    hojaEstadoCuenta.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          left: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          right: { style: 'thin', color: { argb: 'FFE5E5E5' } }
        };
      });
    });

    hojaEstadoCuenta.autoFilter = {
      from: 'A1',
      to: 'M1'
    };


    // HOJA 3: RESUMEN FINANCIERO
    const hojaResumen = workbook.addWorksheet('Resumen Financiero', {
      properties: { tabColor: { argb: 'FFFBBF24' } }
    });

    hojaResumen.mergeCells('A1:D1');
    const tituloCell = hojaResumen.getCell('A1');
    tituloCell.value = 'REPORTE FINANCIERO - RESUMEN';
    tituloCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
    tituloCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF10B981' }
    };
    hojaResumen.getRow(1).height = 30;

    hojaResumen.addRow([]);
    hojaResumen.addRow(['PERÍODO DEL REPORTE']);
    hojaResumen.getCell('A3').font = { bold: true, size: 12 };

    const rowDesde = hojaResumen.addRow(['Desde:', filtros.fechaInicio ? new Date(filtros.fechaInicio) : 'N/A']);
    if (filtros.fechaInicio) rowDesde.getCell(2).numFmt = 'dd/mm/yyyy';

    const rowHasta = hojaResumen.addRow(['Hasta:', filtros.fechaFin ? new Date(filtros.fechaFin) : 'N/A']);
    if (filtros.fechaFin) rowHasta.getCell(2).numFmt = 'dd/mm/yyyy';

    hojaResumen.addRow([]);
    hojaResumen.addRow(['ESTADÍSTICAS FINANCIERAS']);
    hojaResumen.getCell('A7').font = { bold: true, size: 12 };

    const stats = [
      ['Total de Pagos', parseInt(estadisticas.total_pagos) || 0],
      ['Pagos Realizados', parseInt(estadisticas.pagos_realizados) || 0],
      ['Pagos Verificados', parseInt(estadisticas.pagos_verificados) || 0],
      ['Pagos Pendientes', parseInt(estadisticas.pagos_pendientes) || 0],
      ['Pagos Vencidos', parseInt(estadisticas.pagos_vencidos) || 0],
      ['Ingresos Totales', parseFloat(estadisticas.ingresos_totales) || 0],
      ['Ingresos Pendientes', parseFloat(estadisticas.ingresos_pendientes) || 0],
      ['Promedio por Pago', parseFloat(estadisticas.promedio_pago) || 0],
      ['Matrículas Pagadas', parseInt(estadisticas.matriculas_pagadas) || 0],
      ['Estudiantes con Saldo', Object.values(estudiantesPorCedula).filter(e => {
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
      if (label.includes('Ingresos') || label.includes('Promedio')) {
        row.getCell(2).numFmt = '$#,##0.00';
      } else {
        row.getCell(2).numFmt = '0';
      }

      if (label.includes('Ingresos Totales')) {
        row.getCell(2).font = { color: { argb: 'FF10B981' }, bold: true, size: 14 };
      } else if (label.includes('Pendientes') || label.includes('Vencidos')) {
        row.getCell(2).font = { color: { argb: 'FFEF4444' }, bold: true };
      }
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
      properties: { tabColor: { argb: 'FF10B981' } },
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
        printTitlesRow: '1:1'
      },
      headerFooter: {
        oddFooter: `&L&"-,Bold"&16Escuela de Belleza Jessica Vélez&"-,Regular"&12&RDescargado: ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} — Pág. &P de &N`
      }
    });

    // Configurar columnas optimizadas para impresión (con índice)
    hojaCursos.columns = [
      { header: '#', key: 'indice', width: 7 },
      { header: 'CÓDIGO', key: 'codigo', width: 12 },
      { header: 'NOMBRE CURSO', key: 'nombre', width: 30 },
      { header: 'DOCENTE', key: 'docente', width: 30 },
      { header: 'HORARIO', key: 'horario', width: 14 },
      { header: 'CAPACIDAD', key: 'capacidad', width: 12 },
      { header: 'INSCRITOS', key: 'inscritos', width: 12 },
      { header: 'OCUPACIÓN %', key: 'ocupacion', width: 14 },
      { header: 'ESTADO', key: 'estado', width: 13 },
      { header: 'AULA', key: 'aula', width: 13 },
      { header: 'FECHA INICIO', key: 'fechaInicio', width: 14 },
      { header: 'FECHA FIN', key: 'fechaFin', width: 14 }
    ];

    // Estilo del header
    hojaCursos.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    hojaCursos.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF10B981' }
    };
    hojaCursos.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hojaCursos.getRow(1).height = 30;

    // Agregar datos
    let indice = 1;
    datos.forEach(curso => {
      // Formatear nombre del docente: Apellidos, Nombres
      const docenteNombre = curso.docente_nombres && curso.docente_apellidos
        ? `${curso.docente_apellidos}, ${curso.docente_nombres}`
        : curso.docente_nombres || curso.docente_apellidos || 'N/A';

      const row = hojaCursos.addRow({
        indice: indice++,
        codigo: curso.codigo_curso,
        nombre: curso.nombre_curso,
        docente: docenteNombre,
        horario: curso.horario,
        capacidad: parseInt(curso.capacidad_maxima) || 0,
        inscritos: parseInt(curso.total_estudiantes) || 0,
        ocupacion: parseFloat(curso.porcentaje_ocupacion) || 0,
        estado: curso.estado?.toUpperCase() || 'ACTIVO',
        aula: curso.aula_nombre || 'N/A',
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

      // Color según ocupación
      const ocupacionCell = row.getCell('ocupacion');
      const ocupacion = parseFloat(curso.porcentaje_ocupacion) || 0;
      if (ocupacion >= 80) {
        ocupacionCell.font = { color: { argb: 'FF10B981' }, bold: true };
      } else if (ocupacion >= 50) {
        ocupacionCell.font = { color: { argb: 'FFF59E0B' }, bold: true };
      } else {
        ocupacionCell.font = { color: { argb: 'FFEF4444' }, bold: true };
      }

      // Color según estado
      const estadoCell = row.getCell('estado');
      if (curso.estado === 'activo') {
        estadoCell.font = { color: { argb: 'FF10B981' }, bold: true };
      } else if (curso.estado === 'inactivo') {
        estadoCell.font = { color: { argb: 'FFEF4444' }, bold: true };
      }

      // Alineación y text wrapping
      ['indice', 'codigo', 'nombre', 'docente', 'horario', 'capacidad', 'inscritos', 'ocupacion', 'estado', 'aula', 'fechaInicio', 'fechaFin'].forEach(key => {
        let alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

        // Centrar columnas específicas
        if (['indice', 'codigo', 'capacidad', 'inscritos', 'ocupacion', 'horario', 'fechaInicio', 'fechaFin', 'estado', 'aula'].includes(key)) {
          alignment.horizontal = 'center';
        }

        row.getCell(key).alignment = alignment;
      });
    });

    // Bordes a todas las celdas
    hojaCursos.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          left: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          right: { style: 'thin', color: { argb: 'FFE5E5E5' } }
        };
      });
    });

    // Filtros automáticos
    hojaCursos.autoFilter = {
      from: 'A1',
      to: 'L1'
    };

    // HOJA 2: ESTADÍSTICAS
    const hojaStats = workbook.addWorksheet('Estadísticas', {
      properties: { tabColor: { argb: 'FF3B82F6' } }
    });

    // Título
    hojaStats.mergeCells('A1:D1');
    const tituloCell = hojaStats.getCell('A1');
    tituloCell.value = 'REPORTE DE CURSOS - ESTADÍSTICAS';
    tituloCell.font = { bold: true, size: 16, color: { argb: 'FF000000' } };
    tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
    tituloCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF10B981' }
    };
    hojaStats.getRow(1).height = 30;

    // Información del período
    hojaStats.addRow([]);
    hojaStats.addRow(['PERÍODO DEL REPORTE']);
    hojaStats.getCell('A3').font = { bold: true, size: 12 };

    if (filtros.fechaInicio) {
      const rowDesde = hojaStats.addRow(['Desde:', new Date(filtros.fechaInicio)]);
      rowDesde.getCell(2).numFmt = 'dd/mm/yyyy';
    }

    if (filtros.fechaFin) {
      const rowHasta = hojaStats.addRow(['Hasta:', new Date(filtros.fechaFin)]);
      rowHasta.getCell(2).numFmt = 'dd/mm/yyyy';
    }

    // Estadísticas
    hojaStats.addRow([]);
    hojaStats.addRow(['ESTADÍSTICAS GENERALES']);
    hojaStats.getCell('A7').font = { bold: true, size: 12 };

    const stats = [
      ['Total de Cursos', parseInt(estadisticas.total_cursos) || 0],
      ['Cursos Activos', parseInt(estadisticas.cursos_activos) || 0],
      ['Total Estudiantes Inscritos', parseInt(estadisticas.total_estudiantes_inscritos) || 0],
      ['Promedio de Ocupación', estadisticas.promedio_ocupacion ? parseFloat(estadisticas.promedio_ocupacion) : 0]
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

      // Color según tipo
      if (label.includes('Activos')) {
        row.getCell(2).font = { color: { argb: 'FF10B981' }, bold: true };
      }
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
