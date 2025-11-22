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
      properties: { tabColor: { argb: 'FFFBBF24' } }
    });

    // Configurar columnas con más información
    hojaDatos.columns = [
      { header: 'CÉDULA', key: 'cedula', width: 15 },
      { header: 'NOMBRES', key: 'nombre', width: 20 },
      { header: 'APELLIDOS', key: 'apellido', width: 20 },
      { header: 'EMAIL', key: 'email', width: 30 },
      { header: 'TELÉFONO', key: 'telefono', width: 15 },
      { header: 'GÉNERO', key: 'genero', width: 12 },
      { header: 'FECHA NACIMIENTO', key: 'fecha_nacimiento', width: 18 },
      { header: 'DIRECCIÓN', key: 'direccion', width: 35 },
      { header: 'CURSO', key: 'nombre_curso', width: 25 },
      { header: 'TIPO CURSO', key: 'tipo_curso', width: 20 },
      { header: 'HORARIO', key: 'horario_curso', width: 12 },
      { header: 'FECHA INSCRIPCIÓN', key: 'fecha_inscripcion', width: 18 },
      { header: 'ESTADO ACADÉMICO', key: 'estado_academico', width: 18 },
      { header: 'NOTA FINAL', key: 'nota_final', width: 12 },
      { header: 'MONTO MATRÍCULA', key: 'monto_matricula', width: 18 }
    ];

    // Estilo del header
    hojaDatos.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    hojaDatos.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFBBF24' }
    };
    hojaDatos.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    hojaDatos.getRow(1).height = 25;


    // Agregar datos
    datos.forEach(estudiante => {
      const row = hojaDatos.addRow({
        cedula: estudiante.cedula,
        nombre: estudiante.nombre,
        apellido: estudiante.apellido,
        email: estudiante.email,
        telefono: estudiante.telefono,
        genero: estudiante.genero,
        fecha_nacimiento: formatearFecha(estudiante.fecha_nacimiento),
        direccion: estudiante.direccion || 'N/A',
        nombre_curso: estudiante.nombre_curso,
        tipo_curso: estudiante.tipo_curso,
        horario_curso: estudiante.horario_curso,
        fecha_inscripcion: formatearFecha(estudiante.fecha_inscripcion),
        estado_academico: estudiante.estado_academico?.toUpperCase(),
        nota_final: estudiante.nota_final || 'N/A',
        monto_matricula: estudiante.monto_matricula
      });

      // Formato de moneda
      row.getCell('monto_matricula').numFmt = '$#,##0.00';

      // Color según estado
      const estadoCell = row.getCell('estado_academico');
      if (estudiante.estado_academico === 'aprobado') {
        estadoCell.font = { color: { argb: 'FF10B981' }, bold: true };
      } else if (estudiante.estado_academico === 'reprobado') {
        estadoCell.font = { color: { argb: 'FFEF4444' }, bold: true };
      } else if (estudiante.estado_academico === 'retirado') {
        estadoCell.font = { color: { argb: 'FFF59E0B' }, bold: true };
      }
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
    hojaResumen.addRow(['Desde:', formatearFecha(filtros.fechaInicio)]);
    hojaResumen.addRow(['Hasta:', formatearFecha(filtros.fechaFin)]);

    if (filtros.estado && filtros.estado !== 'todos') {
      hojaResumen.addRow(['Estado:', filtros.estado.toUpperCase()]);
    }

    // Estadísticas
    hojaResumen.addRow([]);
    hojaResumen.addRow(['ESTADÍSTICAS GENERALES']);
    hojaResumen.getCell('A8').font = { bold: true, size: 12 };

    const stats = [
      ['Total de Estudiantes', estadisticas.total_estudiantes || 0],
      ['Estudiantes Activos', estadisticas.activos || 0],
      ['Estudiantes Aprobados', estadisticas.aprobados || 0],
      ['Estudiantes Reprobados', estadisticas.reprobados || 0],
      ['Estudiantes Retirados', estadisticas.retirados || 0],
      ['Estudiantes Graduados', estadisticas.graduados || 0],
      ['Promedio de Notas', estadisticas.promedio_notas ? parseFloat(estadisticas.promedio_notas).toFixed(2) : 'N/A']
    ];

    stats.forEach(([label, valor]) => {
      const row = hojaResumen.addRow([label, valor]);
      row.getCell(1).font = { bold: true };
      row.getCell(2).alignment = { horizontal: 'center' };

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


/**
 * GENERAR EXCEL - REPORTE FINANCIERO MEJORADO
 * Incluye hoja de estado de cuenta por estudiante
 */
async function generarExcelFinanciero(datos, filtros, estadisticas) {
  try {
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'Sistema SGA Belleza';
    workbook.created = new Date();

    // HOJA 1: DATOS DETALLADOS DE PAGOS
    const hojaDatos = workbook.addWorksheet('Pagos Detallados', {
      properties: { tabColor: { argb: 'FF10B981' } }
    });

    hojaDatos.columns = [
      { header: 'IDENTIFICACIÓN', key: 'cedula_estudiante', width: 18 },
      { header: 'NOMBRE COMPLETO', key: 'nombre_estudiante', width: 35 },
      { header: 'CURSO', key: 'nombre_curso', width: 28 },
      { header: 'TIPO CURSO', key: 'tipo_curso', width: 18 },
      { header: 'N° CUOTA', key: 'numero_cuota', width: 10 },
      { header: 'MONTO', key: 'monto', width: 12 },
      { header: 'FECHA PAGO', key: 'fecha_pago', width: 15 },
      { header: 'FECHA VENC.', key: 'fecha_vencimiento', width: 15 },
      { header: 'MÉTODO PAGO', key: 'metodo_pago', width: 15 },
      { header: 'N° COMPROBANTE', key: 'numero_comprobante', width: 20 },
      { header: 'ESTADO', key: 'estado_pago', width: 14 },
      { header: 'OBSERVACIONES', key: 'observaciones', width: 30 }
    ];

    // Estilo del header
    hojaDatos.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    hojaDatos.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF10B981' }
    };
    hojaDatos.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    hojaDatos.getRow(1).height = 25;

    // Agregar datos
    datos.forEach(pago => {
      const row = hojaDatos.addRow({
        cedula_estudiante: pago.cedula_estudiante || 'N/A',
        nombre_estudiante: `${pago.nombre_estudiante} ${pago.apellido_estudiante}`,
        nombre_curso: pago.nombre_curso,
        tipo_curso: pago.tipo_curso || 'N/A',
        numero_cuota: pago.numero_cuota,
        monto: pago.monto,
        fecha_pago: pago.fecha_pago ? formatearFecha(pago.fecha_pago) : 'Pendiente',
        fecha_vencimiento: formatearFecha(pago.fecha_vencimiento),
        metodo_pago: pago.metodo_pago?.toUpperCase() || 'N/A',
        numero_comprobante: pago.numero_comprobante || 'N/A',
        estado_pago: pago.estado_pago?.toUpperCase(),
        observaciones: pago.observaciones || ''
      });

      row.getCell('monto').numFmt = '$#,##0.00';

      const estadoCell = row.getCell('estado_pago');
      if (pago.estado_pago === 'verificado') {
        estadoCell.font = { color: { argb: 'FF10B981' }, bold: true };
      } else if (pago.estado_pago === 'pendiente') {
        estadoCell.font = { color: { argb: 'FFEF4444' }, bold: true };
      } else if (pago.estado_pago === 'pagado') {
        estadoCell.font = { color: { argb: 'FF3B82F6' }, bold: true };
      }
    });

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
      to: 'L1'
    };


    // HOJA 2: ESTADO DE CUENTA POR ESTUDIANTE
    const hojaEstadoCuenta = workbook.addWorksheet('Estado de Cuenta', {
      properties: { tabColor: { argb: 'FF3B82F6' } }
    });

    hojaEstadoCuenta.columns = [
      { header: 'CÉDULA', key: 'cedula', width: 15 },
      { header: 'NOMBRE COMPLETO', key: 'nombre', width: 35 },
      { header: 'CURSO', key: 'curso', width: 28 },
      { header: 'TOTAL A PAGAR', key: 'total', width: 15 },
      { header: 'CUOTAS VERIFICADAS', key: 'verificadas', width: 18 },
      { header: 'MONTO PAGADO', key: 'pagado', width: 15 },
      { header: 'CUOTAS PENDIENTES', key: 'pendientes', width: 18 },
      { header: 'SALDO PENDIENTE', key: 'saldo', width: 15 },
      { header: '% PAGADO', key: 'porcentaje', width: 12 },
      { header: 'ESTADO', key: 'estado', width: 15 }
    ];

    hojaEstadoCuenta.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    hojaEstadoCuenta.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3B82F6' }
    };
    hojaEstadoCuenta.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    hojaEstadoCuenta.getRow(1).height = 25;

    // Agrupar datos por estudiante
    const estudiantesPorCedula = {};
    datos.forEach(pago => {
      const cedula = pago.cedula_estudiante || 'SIN_CEDULA';
      if (!estudiantesPorCedula[cedula]) {
        estudiantesPorCedula[cedula] = {
          cedula: pago.cedula_estudiante,
          nombre: `${pago.nombre_estudiante} ${pago.apellido_estudiante}`,
          curso: pago.nombre_curso,
          pagos: []
        };
      }
      estudiantesPorCedula[cedula].pagos.push(pago);
    });

    // Procesar cada estudiante
    Object.values(estudiantesPorCedula).forEach(estudiante => {
      const totalPagos = estudiante.pagos.length;
      const cuotasVerificadas = estudiante.pagos.filter(p => p.estado_pago === 'verificado').length;
      const cuotasPendientes = estudiante.pagos.filter(p => p.estado_pago === 'pendiente' || p.estado_pago === 'pagado').length;

      const totalAPagar = estudiante.pagos.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
      const montoPagado = estudiante.pagos
        .filter(p => p.estado_pago === 'verificado')
        .reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
      const saldoPendiente = totalAPagar - montoPagado;
      const porcentajePagado = totalAPagar > 0 ? ((montoPagado / totalAPagar) * 100).toFixed(1) : 0;

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
        cedula: estudiante.cedula || 'N/A',
        nombre: estudiante.nombre,
        curso: estudiante.curso,
        total: totalAPagar,
        verificadas: cuotasVerificadas,
        pagado: montoPagado,
        pendientes: cuotasPendientes,
        saldo: saldoPendiente,
        porcentaje: `${porcentajePagado}%`,
        estado: estado
      });

      row.getCell('total').numFmt = '$#,##0.00';
      row.getCell('pagado').numFmt = '$#,##0.00';
      row.getCell('saldo').numFmt = '$#,##0.00';

      const estadoCell = row.getCell('estado');
      if (estado === 'AL DÍA') {
        estadoCell.font = { color: { argb: 'FF10B981' }, bold: true };
      } else if (estado === 'VENCIDO') {
        estadoCell.font = { color: { argb: 'FFEF4444' }, bold: true };
      } else {
        estadoCell.font = { color: { argb: 'FFF59E0B' }, bold: true };
      }

      const porcentajeCell = row.getCell('porcentaje');
      const pct = parseFloat(porcentajePagado);
      if (pct >= 100) {
        porcentajeCell.font = { color: { argb: 'FF10B981' }, bold: true };
      } else if (pct >= 50) {
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
      to: 'J1'
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
    hojaResumen.addRow(['Desde:', formatearFecha(filtros.fechaInicio)]);
    hojaResumen.addRow(['Hasta:', formatearFecha(filtros.fechaFin)]);

    hojaResumen.addRow([]);
    hojaResumen.addRow(['ESTADÍSTICAS FINANCIERAS']);
    hojaResumen.getCell('A7').font = { bold: true, size: 12 };

    const stats = [
      ['Total de Pagos', estadisticas.total_pagos || 0],
      ['Pagos Realizados', estadisticas.pagos_realizados || 0],
      ['Pagos Verificados', estadisticas.pagos_verificados || 0],
      ['Pagos Pendientes', estadisticas.pagos_pendientes || 0],
      ['Pagos Vencidos', estadisticas.pagos_vencidos || 0],
      ['Ingresos Totales', `$${parseFloat(estadisticas.ingresos_totales || 0).toFixed(2)}`],
      ['Ingresos Pendientes', `$${parseFloat(estadisticas.ingresos_pendientes || 0).toFixed(2)}`],
      ['Promedio por Pago', `$${parseFloat(estadisticas.promedio_pago || 0).toFixed(2)}`],
      ['Matrículas Pagadas', estadisticas.matriculas_pagadas || 0],
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

    // HOJA: CURSOS DETALLADOS
    const hojaCursos = workbook.addWorksheet('Cursos', {
      properties: { tabColor: { argb: 'FF10B981' } }
    });

    hojaCursos.columns = [
      { header: 'CÓDIGO', key: 'codigo', width: 15 },
      { header: 'NOMBRE CURSO', key: 'nombre', width: 30 },
      { header: 'TIPO', key: 'tipo', width: 20 },
      { header: 'HORARIO', key: 'horario', width: 15 },
      { header: 'CAPACIDAD', key: 'capacidad', width: 12 },
      { header: 'INSCRITOS', key: 'inscritos', width: 12 },
      { header: 'OCUPACIÓN %', key: 'ocupacion', width: 12 },
      { header: 'ESTADO', key: 'estado', width: 15 },
      { header: 'DOCENTE', key: 'docente', width: 30 },
      { header: 'AULA', key: 'aula', width: 15 },
      { header: 'FECHA INICIO', key: 'fechaInicio', width: 15 },
      { header: 'FECHA FIN', key: 'fechaFin', width: 15 },
      { header: 'DURACIÓN (HORAS)', key: 'duracion', width: 18 }
    ];

    hojaCursos.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hojaCursos.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF10B981' }
    };
    hojaCursos.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    hojaCursos.getRow(1).height = 25;

    datos.forEach(curso => {
      const row = hojaCursos.addRow({
        codigo: curso.codigo_curso,
        nombre: curso.nombre_curso,
        tipo: curso.tipo_curso,
        horario: curso.horario,
        capacidad: curso.capacidad_maxima,
        inscritos: curso.total_estudiantes,
        ocupacion: `${curso.porcentaje_ocupacion || 0}%`,
        estado: curso.estado?.toUpperCase() || 'ACTIVO',
        docente: curso.docente_nombres ? `${curso.docente_nombres} ${curso.docente_apellidos || ''}` : 'N/A',
        aula: curso.aula_nombre || 'N/A',
        fechaInicio: formatearFecha(curso.fecha_inicio),
        fechaFin: formatearFecha(curso.fecha_fin),
        duracion: curso.duracion_horas || 'N/A'
      });

      // Color según ocupación
      const ocupacionCell = row.getCell('ocupacion');
      const ocupacion = parseFloat(curso.porcentaje_ocupacion || 0);
      if (ocupacion >= 80) {
        ocupacionCell.font = { color: { argb: 'FF10B981' }, bold: true };
      } else if (ocupacion >= 50) {
        ocupacionCell.font = { color: { argb: 'FFF59E0B' }, bold: true };
      } else {
        ocupacionCell.font = { color: { argb: 'FFEF4444' }, bold: true };
      }
    });

    hojaCursos.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        if (rowNumber > 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    hojaCursos.autoFilter = {
      from: 'A1',
      to: 'M1'
    };

    // HOJA: ESTADÍSTICAS
    const hojaStats = workbook.addWorksheet('Estadísticas', {
      properties: { tabColor: { argb: 'FF3B82F6' } }
    });

    hojaStats.columns = [
      { header: 'MÉTRICA', key: 'metrica', width: 30 },
      { header: 'VALOR', key: 'valor', width: 20 }
    ];

    hojaStats.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hojaStats.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3B82F6' }
    };

    hojaStats.addRow({ metrica: 'Total de Cursos', valor: estadisticas.total_cursos || 0 });
    hojaStats.addRow({ metrica: 'Cursos Activos', valor: estadisticas.cursos_activos || 0 });
    hojaStats.addRow({ metrica: 'Total Estudiantes Inscritos', valor: estadisticas.total_estudiantes_inscritos || 0 });
    hojaStats.addRow({ metrica: 'Promedio de Ocupación', valor: `${estadisticas.promedio_ocupacion || 0}%` });

    hojaStats.eachRow(row => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

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
