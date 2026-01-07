const PDFDocument = require('pdfkit');
const axios = require('axios');

// URL del logo de la escuela Jessica Vélez
const LOGO_URL = 'https://res.cloudinary.com/di090ggjn/image/upload/v1757037016/clbfrmifo1mbpzma5qts.png';

/**
 * Descargar logo de la escuela
 */
async function descargarLogo() {
  try {
    const response = await axios.get(LOGO_URL, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('Error descargando logo:', error.message);
    return null;
  }
}

/**
 * Formatear fecha en español
 */
function formatearFecha(fecha) {
  if (!fecha) return 'N/A';
  const date = new Date(fecha);
  const opciones = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('es-ES', opciones);
}

/**
 * Formatear moneda
 */
function formatearMoneda(monto) {
  return `$${parseFloat(monto).toFixed(2)}`;
}

/**
 * GENERAR PDF - REPORTE DE ESTUDIANTES
 */
async function generarPDFEstudiantes(datos, filtros, estadisticas) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 0, left: 40, right: 40 },
        bufferPages: true
      });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colores corporativos
      const colors = {
        primary: '#fbbf24',      // Dorado
        dark: '#000000',         // Negro
        text: '#1a1a1a',         // Texto oscuro
        textGray: '#666666',     // Gris
        border: '#e5e5e5',       // Borde claro
        success: '#10b981',      // Verde
        error: '#ef4444'         // Rojo
      };

      // Descargar logo
      const logoBuffer = await descargarLogo();

      // HEADER CON LOGO CENTRADO
      if (logoBuffer) {
        doc.image(logoBuffer, (doc.page.width - 100) / 2, 10, { width: 100 });
      }

      doc.moveDown(3.8);

      // Nombre de la institución
      doc.fontSize(10)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('ESCUELA DE BELLEZA JESSICA VÉLEZ', { align: 'center' });

      doc.moveDown(0.3);

      // Título del reporte
      doc.fontSize(14)
        .fillColor(colors.primary)
        .text('REPORTE DE ESTUDIANTES', { align: 'center' });

      doc.moveDown(0.2);

      // Fecha de generación
      doc.fontSize(9)
        .fillColor(colors.textGray)
        .font('Helvetica')
        .text(`Generado el: ${formatearFecha(new Date())}`, { align: 'center' });

      doc.moveDown(1);

      // Línea separadora
      doc.strokeColor(colors.primary)
        .lineWidth(2)
        .moveTo(40, doc.y)
        .lineTo(doc.page.width - 40, doc.y)
        .stroke();

      doc.moveDown(1);

      // ========================================
      // INFORMACIÓN DEL PERÍODO Y FILTROS
      // ========================================
      doc.fontSize(12)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('PERÍODO DEL REPORTE', { underline: true });

      doc.moveDown(0.5);

      doc.fontSize(10)
        .font('Helvetica')
        .fillColor(colors.text)
        .text(`Desde: ${formatearFecha(filtros.fechaInicio)}`, { continued: true })
        .text(`     Hasta: ${formatearFecha(filtros.fechaFin)}`);

      if (filtros.estado && filtros.estado !== 'todos') {
        doc.text(`Estado: ${filtros.estado.toUpperCase()}`);
      }

      if (filtros.nombreCurso) {
        doc.text(`Curso: ${filtros.nombreCurso}`);
      }

      doc.moveDown(1);

      // ========================================
      // TABLA DE ESTUDIANTES
      // ========================================
      doc.fontSize(12)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('LISTADO DE ESTUDIANTES', { underline: true });

      doc.moveDown(0.5);

      const tableTop = doc.y;
      const colWidths = {
        indice: 25,
        cedula: 80,
        nombre: 135,
        curso: 110,
        fecha: 85,
        estado: 80 // Se ajustará
      };
      colWidths.estado = (doc.page.width - 80) - (colWidths.indice + colWidths.cedula + colWidths.nombre + colWidths.curso + colWidths.fecha);

      const dibujarEncabezadoTabla = (y) => {
        let x = 40;
        doc.rect(40, y, doc.page.width - 80, 25).fillAndStroke(colors.primary, colors.primary);
        doc.fontSize(8).fillColor(colors.dark).font('Helvetica-Bold');

        doc.text('#', x, y + 8, { width: colWidths.indice, align: 'center' });
        x += colWidths.indice;
        doc.text('CÉDULA', x, y + 8, { width: colWidths.cedula, align: 'center' });
        x += colWidths.cedula;
        doc.text('NOMBRE COMPLETO', x, y + 8, { width: colWidths.nombre, align: 'center' });
        x += colWidths.nombre;
        doc.text('CURSO', x, y + 8, { width: colWidths.curso, align: 'center' });
        x += colWidths.curso;
        doc.text('FECHA INSC.', x, y + 8, { width: colWidths.fecha, align: 'center' });
        x += colWidths.fecha;
        doc.text('ESTADO', x, y + 8, { width: colWidths.estado, align: 'center' });
      };

      // Dibujar primer encabezado
      dibujarEncabezadoTabla(tableTop);

      // Agrupar por estudiante (en caso de que uno esté en varios cursos)
      const estudiantesAgrupados = {};
      datos.forEach(est => {
        const key = est.cedula || `${est.nombre}_${est.apellido}`;
        if (!estudiantesAgrupados[key]) estudiantesAgrupados[key] = [];
        estudiantesAgrupados[key].push(est);
      });

      const idsOrdenados = Object.keys(estudiantesAgrupados).sort((a, b) => {
        const apA = estudiantesAgrupados[a][0].apellido || '';
        const apB = estudiantesAgrupados[b][0].apellido || '';
        return apA.localeCompare(apB);
      });

      let yPos = tableTop + 30;
      let indiceGlobal = 1;

      idsOrdenados.forEach((id) => {
        const todosLosCursosEst = estudiantesAgrupados[id];
        let cursosRestantes = [...todosLosCursosEst];

        while (cursosRestantes.length > 0) {
          // Determinar cuántos cursos caben en la página actual
          let yEspacioDisponible = doc.page.height - 100 - yPos;
          let numCursosQueCaben = Math.floor(yEspacioDisponible / 20);

          if (numCursosQueCaben <= 0) {
            doc.addPage();
            yPos = 50;
            dibujarEncabezadoTabla(yPos);
            yPos += 30;
            yEspacioDisponible = doc.page.height - 100 - yPos;
            numCursosQueCaben = Math.floor(yEspacioDisponible / 20);
          }

          const cursosEnEstaPagina = cursosRestantes.splice(0, Math.min(numCursosQueCaben, cursosRestantes.length));
          const alturaBloque = cursosEnEstaPagina.length * 20;
          const yInicioBloque = yPos;

          // 1. Dibujar filas de cursos (columnas derecha)
          cursosEnEstaPagina.forEach((estudiante, cIdx) => {
            // Fondo alternado por estudiante
            if (indiceGlobal % 2 === 0) {
              doc.rect(40, yPos - 5, doc.page.width - 80, 20).fillColor('#f9f9f9').fill();
            }

            // Bordes de columnas de curso (siempre por fila)
            doc.lineWidth(0.5).strokeColor(colors.border);
            let xTmp = 40 + colWidths.indice + colWidths.cedula + colWidths.nombre;
            [colWidths.curso, colWidths.fecha, colWidths.estado].forEach(width => {
              doc.rect(xTmp, yPos - 5, width, 20).stroke();
              xTmp += width;
            });

            const xContenidoCurso = 40 + colWidths.indice + colWidths.cedula + colWidths.nombre;
            let currentX = xContenidoCurso;
            doc.fontSize(7.5).fillColor(colors.text).font('Helvetica');

            // Curso
            doc.text(estudiante.nombre_curso || 'N/A', currentX, yPos + 4, { width: colWidths.curso, align: 'center' });
            currentX += colWidths.curso;

            // Fecha inscripción
            const fechaInsc = estudiante.fecha_inscripcion ? new Date(estudiante.fecha_inscripcion).toLocaleDateString('es-ES') : 'N/A';
            doc.text(fechaInsc, currentX, yPos + 4, { width: colWidths.fecha, align: 'center' });
            currentX += colWidths.fecha;

            // Estado con color
            let estadoColor = colors.text;
            if (estudiante.estado_academico === 'aprobado') estadoColor = colors.success;
            if (estudiante.estado_academico === 'reprobado') estadoColor = colors.error;
            if (estudiante.estado_academico === 'retirado') estadoColor = '#f59e0b';

            doc.fillColor(estadoColor).font('Helvetica-Bold')
              .text(estudiante.estado_academico ? estudiante.estado_academico.toUpperCase() : 'N/A', currentX, yPos + 4, { width: colWidths.estado, align: 'center' });

            yPos += 20;
          });

          // 2. Dibujar celdas "combinadas" (columnas izquierda)
          doc.lineWidth(0.5).strokeColor(colors.border);
          let xEst = 40;
          [colWidths.indice, colWidths.cedula, colWidths.nombre].forEach(width => {
            doc.rect(xEst, yInicioBloque - 5, width, alturaBloque).stroke();
            xEst += width;
          });

          // Contenido centrado verticalmente
          const primerEst = cursosEnEstaPagina[0];
          const yCentro = yInicioBloque - 5 + (alturaBloque / 2);

          let xCont = 40;
          doc.fillColor(colors.text);

          // #
          doc.font('Helvetica-Bold').fontSize(8)
            .text(indiceGlobal.toString(), xCont, yCentro - 4, { width: colWidths.indice, align: 'center' });
          xCont += colWidths.indice;

          // Cédula
          doc.font('Helvetica').fontSize(7.5)
            .text(primerEst.cedula || 'N/A', xCont, yCentro - 4, { width: colWidths.cedula, align: 'center' });
          xCont += colWidths.cedula;

          // Nombre completo
          doc.font('Helvetica-Bold').fontSize(7.5)
            .text(`${primerEst.nombre} ${primerEst.apellido}`, xCont, yCentro - 4, { width: colWidths.nombre, align: 'center' });
        }
        indiceGlobal++;
      });

      // ========================================
      // PÁGINA DE RESUMEN DETALLADO
      // ========================================
      doc.addPage();

      // Título del resumen
      doc.fontSize(16)
        .fillColor(colors.primary)
        .font('Helvetica-Bold')
        .text('RESUMEN DETALLADO', { align: 'center' });

      doc.moveDown(1);

      // Información del período
      doc.fontSize(11)
        .fillColor(colors.dark)
        .text('PERÍODO DEL REPORTE', { underline: true });

      doc.moveDown(0.5);
      doc.fontSize(10)
        .fillColor(colors.text)
        .font('Helvetica')
        .text(`Desde: ${formatearFecha(filtros.fechaInicio)}`);
      doc.text(`Hasta: ${formatearFecha(filtros.fechaFin)}`);

      if (filtros.estado && filtros.estado !== 'todos') {
        doc.text(`Estado filtrado: ${filtros.estado.toUpperCase()}`);
      }

      doc.moveDown(1);

      // Estadísticas generales
      doc.fontSize(11)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('ESTADÍSTICAS GENERALES', { underline: true });

      doc.moveDown(0.5);

      const stats = [
        { label: 'Total de Estudiantes:', value: estadisticas.total_estudiantes || 0, color: colors.text },
        { label: 'Estudiantes Activos:', value: estadisticas.activos || 0, color: colors.success },
        { label: 'Estudiantes Aprobados:', value: estadisticas.aprobados || 0, color: colors.success },
        { label: 'Estudiantes Reprobados:', value: estadisticas.reprobados || 0, color: colors.error },
        { label: 'Estudiantes Retirados:', value: estadisticas.retirados || 0, color: '#f59e0b' },
        { label: 'Estudiantes Graduados:', value: estadisticas.graduados || 0, color: colors.primary },
        { label: 'Promedio de Notas:', value: estadisticas.promedio_notas ? parseFloat(estadisticas.promedio_notas).toFixed(2) : 'N/A', color: colors.text }
      ];

      stats.forEach(stat => {
        doc.fontSize(10)
          .fillColor(colors.text)
          .font('Helvetica')
          .text(stat.label, { continued: true })
          .fillColor(stat.color)
          .font('Helvetica-Bold')
          .text(` ${stat.value}`);
      });

      doc.moveDown(1);

      // Análisis de rendimiento
      doc.fontSize(11)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('ANÁLISIS DE RENDIMIENTO', { underline: true });

      doc.moveDown(0.5);

      const totalEstudiantes = estadisticas.total_estudiantes || 0;
      const tasaAprobacion = totalEstudiantes > 0 ? ((estadisticas.aprobados / totalEstudiantes) * 100).toFixed(1) : 0;
      const tasaRetencion = totalEstudiantes > 0 ? (((totalEstudiantes - (estadisticas.retirados || 0)) / totalEstudiantes) * 100).toFixed(1) : 0;

      doc.fontSize(10)
        .fillColor(colors.text)
        .font('Helvetica')
        .text(`Tasa de Aprobación: `, { continued: true })
        .fillColor(colors.success)
        .font('Helvetica-Bold')
        .text(`${tasaAprobacion}%`);

      doc.fillColor(colors.text)
        .font('Helvetica')
        .text(`Tasa de Retención: `, { continued: true })
        .fillColor(colors.success)
        .font('Helvetica-Bold')
        .text(`${tasaRetencion}%`);

      doc.moveDown(1);

      // Observaciones
      doc.fontSize(11)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('OBSERVACIONES', { underline: true });

      doc.moveDown(0.5);
      doc.fontSize(9)
        .fillColor(colors.textGray)
        .font('Helvetica')
        .text('• Este reporte muestra el estado académico de los estudiantes en el período seleccionado.');
      doc.text('• Los datos reflejan la información actualizada al momento de la generación del reporte.');
      doc.text('• Para más detalles, consulte el sistema de gestión académica.');

      // ========================================
      // FOOTER EN TODAS LAS PÁGINAS
      // ========================================
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);

        // Línea separadora
        doc.strokeColor(colors.border)
          .lineWidth(1)
          .moveTo(40, doc.page.height - 50)
          .lineTo(doc.page.width - 40, doc.page.height - 50)
          .stroke();

        // Texto del footer
        doc.fontSize(8)
          .fillColor(colors.textGray)
          .font('Helvetica')
          .text(
            'Sistema de Gestión Académica - Escuela de Belleza Jessica Vélez',
            40,
            doc.page.height - 40,
            { align: 'center', width: doc.page.width - 80 }
          );

        // Número de página
        doc.text(
          `Página ${i + 1} de ${pages.count}`,
          0,
          doc.page.height - 30,
          { align: 'center' }
        );
      }

      doc.end();
    } catch (error) {
      console.error('Error generando PDF de estudiantes:', error);
      reject(error);
    }
  });
}

/**
 * GENERAR PDF - REPORTE FINANCIERO
 */
async function generarPDFFinanciero(datos, filtros, estadisticas) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 0, left: 40, right: 40 },
        bufferPages: true
      });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const colors = {
        primary: '#fbbf24',
        dark: '#000000',
        text: '#1a1a1a',
        textGray: '#666666',
        border: '#e5e5e5',
        success: '#10b981',
        error: '#ef4444'
      };

      const logoBuffer = await descargarLogo();

      // HEADER
      if (logoBuffer) {
        doc.image(logoBuffer, (doc.page.width - 100) / 2, 10, { width: 100 });
      }

      doc.moveDown(3.8);

      doc.fontSize(10)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('ESCUELA DE BELLEZA JESSICA VÉLEZ', { align: 'center' });

      doc.moveDown(0.3);

      doc.fontSize(14)
        .fillColor(colors.primary)
        .text('REPORTE FINANCIERO', { align: 'center' });

      doc.moveDown(0.2);

      doc.fontSize(9)
        .fillColor(colors.textGray)
        .font('Helvetica')
        .text(`Generado el: ${formatearFecha(new Date())}`, { align: 'center' });

      doc.moveDown(1);

      doc.strokeColor(colors.primary)
        .lineWidth(2)
        .moveTo(40, doc.y)
        .lineTo(doc.page.width - 40, doc.y)
        .stroke();

      doc.moveDown(1);

      // PERÍODO
      doc.fontSize(12)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('PERÍODO DEL REPORTE', { underline: true });

      doc.moveDown(0.5);

      doc.fontSize(10)
        .font('Helvetica')
        .fillColor(colors.text)
        .text(`Desde: ${formatearFecha(filtros.fechaInicio)}`, { continued: true })
        .text(`     Hasta: ${formatearFecha(filtros.fechaFin)}`);

      doc.moveDown(1);

      // TABLA DE PAGOS
      doc.fontSize(12)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('DETALLE DE PAGOS', { underline: true });

      doc.moveDown(0.5);

      const tableTop = doc.y;
      const colWidths = {
        indice: 25,
        cedula: 75,
        nombre: 115,
        curso: 95,
        monto: 50,
        fecha: 55,
        metodo: 60,
        estado: 40 // Se ajustará
      };
      colWidths.estado = (doc.page.width - 80) - (colWidths.indice + colWidths.cedula + colWidths.nombre + colWidths.curso + colWidths.monto + colWidths.fecha + colWidths.metodo);

      const dibujarEncabezadoTabla = (y) => {
        let x = 40;
        doc.rect(40, y, doc.page.width - 80, 28).fillAndStroke(colors.primary, colors.primary);
        doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold');

        doc.text('#', x, y + 9, { width: colWidths.indice, align: 'center' });
        x += colWidths.indice;
        doc.text('ID', x, y + 9, { width: colWidths.cedula, align: 'center' });
        x += colWidths.cedula;
        doc.text('NOMBRE', x, y + 9, { width: colWidths.nombre, align: 'center' });
        x += colWidths.nombre;
        doc.text('CURSO', x, y + 9, { width: colWidths.curso, align: 'center' });
        x += colWidths.curso;
        doc.text('MONTO', x, y + 9, { width: colWidths.monto, align: 'center' });
        x += colWidths.monto;
        doc.text('FECHA', x, y + 9, { width: colWidths.fecha, align: 'center' });
        x += colWidths.fecha;
        doc.text('MÉT.', x, y + 9, { width: colWidths.metodo, align: 'center' });
        x += colWidths.metodo;
        doc.text('EST.', x, y + 9, { width: colWidths.estado, align: 'center' });
      };

      // Dibujar primer encabezado
      dibujarEncabezadoTabla(tableTop);

      // Agrupar pagos por estudiante para que el reporte sea coherente (igual que en Excel)
      const pagosAgrupados = {};
      datos.forEach(pago => {
        const key = pago.cedula_estudiante || pago.nombre_estudiante || 'SIN_ID';
        if (!pagosAgrupados[key]) {
          pagosAgrupados[key] = [];
        }
        pagosAgrupados[key].push(pago);
      });

      // Ordenar estudiantes por apellido (consistencia con Excel)
      const identificacionesOrdenadas = Object.keys(pagosAgrupados).sort((a, b) => {
        const apA = pagosAgrupados[a][0].apellido_estudiante || '';
        const apB = pagosAgrupados[b][0].apellido_estudiante || '';
        return apA.localeCompare(apB);
      });

      let yPos = tableTop + 33;
      let indiceGlobal = 1;

      identificacionesOrdenadas.forEach((id) => {
        const todosLosPagosEstudiante = pagosAgrupados[id];
        let pagosRestantes = [...todosLosPagosEstudiante];

        while (pagosRestantes.length > 0) {
          // Determinar cuántos pagos del estudiante caben en la página actual
          let yEspacioDisponible = doc.page.height - 100 - yPos;
          let numPagosQueCaben = Math.floor(yEspacioDisponible / 32);

          if (numPagosQueCaben <= 0) {
            doc.addPage();
            yPos = 50;
            dibujarEncabezadoTabla(yPos);
            yPos += 35;
            yEspacioDisponible = doc.page.height - 100 - yPos;
            numPagosQueCaben = Math.floor(yEspacioDisponible / 32);
          }

          const pagosEnEstaPagina = pagosRestantes.splice(0, Math.min(numPagosQueCaben, pagosRestantes.length));
          const alturaBloque = pagosEnEstaPagina.length * 32;
          const yInicioBloque = yPos;

          // 1. Dibujar filas de pagos (columnas de la derecha)
          pagosEnEstaPagina.forEach((pago, pIdx) => {
            // Fondo alternado por estudiante
            if (indiceGlobal % 2 === 0) {
              doc.rect(40, yPos - 6, doc.page.width - 80, 32)
                .fillColor('#f9f9f9')
                .fill();
            }

            // Bordes de las columnas de PAGO (siempre se dibujan por fila)
            doc.lineWidth(0.5).strokeColor(colors.border);
            let xTmp = 40 + colWidths.indice + colWidths.cedula + colWidths.nombre;
            [colWidths.curso, colWidths.monto, colWidths.fecha, colWidths.metodo, colWidths.estado].forEach(width => {
              doc.rect(xTmp, yPos - 6, width, 32).stroke();
              xTmp += width;
            });

            const xContenidoPago = 40 + colWidths.indice + colWidths.cedula + colWidths.nombre;
            let currentX = xContenidoPago;

            doc.fontSize(7.5).fillColor(colors.text).font('Helvetica');

            // Curso
            const cursoNombre = pago.nombre_curso || 'N/A';
            const cursoCorto = cursoNombre.length > 20 ? cursoNombre.substring(0, 18) + '...' : cursoNombre;
            doc.text(cursoCorto, currentX, yPos + 6, { width: colWidths.curso, align: 'center' });
            currentX += colWidths.curso;

            // Monto
            doc.text(formatearMoneda(pago.monto), currentX, yPos + 6, { width: colWidths.monto, align: 'center' });
            currentX += colWidths.monto;

            // Fecha
            let fechaMostrar = 'N/A';
            if (pago.fecha_pago) {
              fechaMostrar = new Date(pago.fecha_pago).toLocaleDateString('es-ES');
            } else if (pago.fecha_vencimiento) {
              fechaMostrar = new Date(pago.fecha_vencimiento).toLocaleDateString('es-ES');
            }
            doc.text(fechaMostrar, currentX, yPos + 6, { width: colWidths.fecha, align: 'center' });
            currentX += colWidths.fecha;

            // Método
            const metodoPago = (pago.estado_pago === 'verificado' || pago.estado_pago === 'pagado') && pago.metodo_pago
              ? (pago.metodo_pago.length > 10 ? (pago.metodo_pago.substring(0, 8) + '.').toUpperCase() : pago.metodo_pago.toUpperCase())
              : 'PEND.';
            doc.text(metodoPago, currentX, yPos + 6, { width: colWidths.metodo, align: 'center' });
            currentX += colWidths.metodo;

            // Estado
            let estadoColor = colors.text;
            if (pago.estado_pago === 'verificado') estadoColor = colors.success;
            if (pago.estado_pago === 'pendiente') estadoColor = colors.error;
            doc.fillColor(estadoColor).font('Helvetica-Bold')
              .text(pago.estado_pago.substring(0, 3).toUpperCase() + '.', currentX, yPos + 6, { width: colWidths.estado, align: 'center' });

            yPos += 32;
          });

          // 2. Dibujar celdas "combinadas" (columnas de la izquierda)
          doc.lineWidth(0.5).strokeColor(colors.border);
          let xEst = 40;

          // Bordes de bloque para #, Cédula, Nombre
          [colWidths.indice, colWidths.cedula, colWidths.nombre].forEach(width => {
            doc.rect(xEst, yInicioBloque - 6, width, alturaBloque).stroke();
            xEst += width;
          });

          // Contenido centrado verticalmente
          const primerPago = pagosEnEstaPagina[0];
          const yCentro = yInicioBloque - 6 + (alturaBloque / 2);

          let xCont = 40;
          doc.fillColor(colors.text);

          // #
          doc.font('Helvetica-Bold').fontSize(8)
            .text(indiceGlobal.toString(), xCont, yCentro - 4, { width: colWidths.indice, align: 'center' });
          xCont += colWidths.indice;

          // Cédula
          doc.font('Helvetica').fontSize(7.5)
            .text(primerPago.cedula_estudiante || 'N/A', xCont, yCentro - 4, { width: colWidths.cedula, align: 'center' });
          xCont += colWidths.cedula;

          // Nombre (Nombre + Apellido)
          const nombreText = `${primerPago.nombre_estudiante}\n${primerPago.apellido_estudiante || ''}`;
          doc.font('Helvetica-Bold').fontSize(7)
            .text(nombreText, xCont, yCentro - 6, { width: colWidths.nombre, align: 'center' });
        }
        indiceGlobal++;
      });

      // FOOTER
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);

        doc.strokeColor(colors.border)
          .lineWidth(1)
          .moveTo(40, doc.page.height - 50)
          .lineTo(doc.page.width - 40, doc.page.height - 50)
          .stroke();

        doc.fontSize(8)
          .fillColor(colors.textGray)
          .font('Helvetica')
          .text(
            'Sistema de Gestión Académica - Escuela de Belleza Jessica Vélez',
            40,
            doc.page.height - 40,
            { align: 'center', width: doc.page.width - 80 }
          );

        doc.text(
          `Página ${i + 1} de ${pages.count}`,
          0,
          doc.page.height - 30,
          { align: 'center' }
        );
      }

      // RESUMEN FINANCIERO
      doc.addPage();
      doc.fontSize(16).fillColor(colors.primary).font('Helvetica-Bold').text('RESUMEN FINANCIERO', { align: 'center' });
      doc.moveDown(1);

      // ESTADÍSTICAS GENERALES
      doc.fontSize(11).fillColor(colors.dark).text('ESTADÍSTICAS GENERALES', { underline: true });
      doc.moveDown(0.5);
      const ingresosTotales = parseFloat(estadisticas.ingresos_totales || 0);
      const promedioPago = parseFloat(estadisticas.promedio_pago || 0);
      doc.fontSize(10).fillColor(colors.text).font('Helvetica').text('Total Pagos: ', { continued: true }).font('Helvetica-Bold').text(`${estadisticas.total_pagos || 0}`);
      doc.font('Helvetica').text('Verificados: ', { continued: true }).fillColor(colors.success).font('Helvetica-Bold').text(`${estadisticas.pagos_verificados || 0}`);
      doc.fillColor(colors.text).font('Helvetica').text('Pendientes: ', { continued: true }).fillColor(colors.error).font('Helvetica-Bold').text(`${estadisticas.pagos_pendientes || 0}`);
      doc.fillColor(colors.text).font('Helvetica').text('Ingresos: ', { continued: true }).fillColor(colors.success).font('Helvetica-Bold').text(`${formatearMoneda(ingresosTotales)}`);
      doc.fillColor(colors.text).font('Helvetica').text('Promedio: ', { continued: true }).font('Helvetica-Bold').text(`${formatearMoneda(promedioPago)}`);

      doc.moveDown(1);

      // ESTUDIANTES CON PAGOS PENDIENTES
      doc.fontSize(11).fillColor(colors.dark).font('Helvetica-Bold').text('ESTUDIANTES CON PAGOS PENDIENTES', { underline: true });
      doc.moveDown(0.5);

      // Agrupar pagos por estudiante (todos los pagos)
      const estudiantesPendientes = {};
      datos.forEach(pago => {
        const key = pago.cedula_estudiante || pago.nombre_estudiante;

        // Inicializar si no existe
        if (!estudiantesPendientes[key]) {
          estudiantesPendientes[key] = {
            nombre: `${pago.nombre_estudiante} ${pago.apellido_estudiante}`,
            cedula: pago.cedula_estudiante,
            curso: pago.nombre_curso,
            cuotasPendientes: 0,
            montoPendiente: 0,
            cuotasVerificadas: 0,
            montoVerificado: 0
          };
        }

        // Contar pagos pendientes
        if (pago.estado_pago === 'pendiente' || pago.estado_pago === 'vencido') {
          estudiantesPendientes[key].cuotasPendientes++;
          estudiantesPendientes[key].montoPendiente += parseFloat(pago.monto || 0);
        }

        // Contar pagos verificados
        if (pago.estado_pago === 'verificado') {
          estudiantesPendientes[key].cuotasVerificadas++;
          estudiantesPendientes[key].montoVerificado += parseFloat(pago.monto || 0);
        }
      });

      // Obtener todos los estudiantes (con o sin pagos pendientes)
      const listaEstudiantes = Object.values(estudiantesPendientes);

      if (listaEstudiantes.length > 0) {
        // Ordenar por cantidad de cuotas pendientes (mayor a menor)
        listaEstudiantes.sort((a, b) => b.cuotasPendientes - a.cuotasPendientes);

        // Mostrar hasta 15 estudiantes
        const maxEstudiantes = Math.min(15, listaEstudiantes.length);

        doc.fontSize(9).fillColor(colors.textGray).font('Helvetica-Oblique')
          .text(`Mostrando ${maxEstudiantes} de ${listaEstudiantes.length} estudiantes con pagos pendientes`);
        doc.moveDown(0.3);

        listaEstudiantes.slice(0, maxEstudiantes).forEach((est, index) => {
          // Verificar si necesitamos nueva página
          if (doc.y > doc.page.height - 120) {
            doc.addPage();
            doc.fontSize(11).fillColor(colors.dark).font('Helvetica-Bold')
              .text('ESTUDIANTES CON PAGOS PENDIENTES (continuación)', { underline: true });
            doc.moveDown(0.5);
          }

          doc.fontSize(9).fillColor(colors.text).font('Helvetica-Bold')
            .text(`${index + 1}. ${est.nombre}`, { continued: true })
            .fillColor(colors.textGray).font('Helvetica')
            .text(` (${est.cedula || 'Sin cédula'})`);

          doc.fontSize(8).fillColor(colors.textGray)
            .text(`   Curso: ${est.curso}`);

          doc.fillColor(colors.success).font('Helvetica-Bold')
            .text(`   Pagos verificados: ${est.cuotasVerificadas}`, { continued: true })
            .fillColor(colors.text).font('Helvetica')
            .text(` | Monto: ${formatearMoneda(est.montoVerificado)}`);

          doc.fillColor(colors.error).font('Helvetica-Bold')
            .text(`   Cuotas pendientes: ${est.cuotasPendientes}`, { continued: true })
            .fillColor(colors.text).font('Helvetica')
            .text(` | Monto: ${formatearMoneda(est.montoPendiente)}`);

          doc.moveDown(0.3);
        });

        if (listaEstudiantes.length > maxEstudiantes) {
          doc.fontSize(8).fillColor(colors.textGray).font('Helvetica-Oblique')
            .text(`... y ${listaEstudiantes.length - maxEstudiantes} estudiantes más con pagos pendientes.`);
        }
      } else {
        doc.fontSize(9).fillColor(colors.success).font('Helvetica-Bold')
          .text('¡Excelente! No hay estudiantes con pagos pendientes en este período.');
      }

      doc.end();
    } catch (error) {
      console.error('Error generando PDF financiero:', error);
      reject(error);
    }
  });
}

/**
 * GENERAR PDF - REPORTE DE CURSOS
 */
async function generarPDFCursos(datos, filtros, estadisticas) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 0, left: 40, right: 40 },
        bufferPages: true
      });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const colors = {
        primary: '#fbbf24',
        dark: '#000000',
        text: '#1a1a1a',
        textGray: '#666666',
        border: '#e5e5e5',
        success: '#10b981',
        error: '#ef4444'
      };

      const logoBuffer = await descargarLogo();

      // HEADER
      if (logoBuffer) {
        doc.image(logoBuffer, (doc.page.width - 100) / 2, 10, { width: 100 });
      }

      doc.moveDown(3.8);

      doc.fontSize(10)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('ESCUELA DE BELLEZA JESSICA VÉLEZ', { align: 'center' });

      doc.moveDown(0.3);

      doc.fontSize(14)
        .fillColor(colors.primary)
        .text('REPORTE DE CURSOS', { align: 'center' });

      doc.moveDown(0.2);

      doc.fontSize(9)
        .fillColor(colors.textGray)
        .font('Helvetica')
        .text(`Generado el: ${formatearFecha(new Date())}`, { align: 'center' });

      doc.moveDown(1);

      doc.strokeColor(colors.primary)
        .lineWidth(2)
        .moveTo(40, doc.y)
        .lineTo(doc.page.width - 40, doc.y)
        .stroke();

      doc.moveDown(1);

      // TABLA DE CURSOS
      doc.fontSize(12)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('LISTADO DE CURSOS', { underline: true });

      doc.moveDown(0.5);

      // Encabezados de tabla
      const tableTop = doc.y;
      const colWidths = {
        indice: 30,
        codigo: 55,
        nombre: 125,
        horario: 75,
        capacidad: 65,
        docente: 85,
        aula: 80 // Se ajustará
      };
      colWidths.aula = (doc.page.width - 80) - (colWidths.indice + colWidths.codigo + colWidths.nombre + colWidths.horario + colWidths.capacidad + colWidths.docente);

      const dibujarEncabezadoTabla = (y) => {
        let x = 40;
        doc.rect(40, y, doc.page.width - 80, 25).fillAndStroke(colors.primary, colors.primary);
        doc.fontSize(8).fillColor(colors.dark).font('Helvetica-Bold');

        doc.text('#', x, y + 8, { width: colWidths.indice, align: 'center' });
        x += colWidths.indice;
        doc.text('CÓD.', x, y + 8, { width: colWidths.codigo, align: 'center' });
        x += colWidths.codigo;
        doc.text('NOMBRE CURSO', x, y + 8, { width: colWidths.nombre, align: 'center' });
        x += colWidths.nombre;
        doc.text('HORARIO', x, y + 8, { width: colWidths.horario, align: 'center' });
        x += colWidths.horario;
        doc.text('CAPACIDAD', x, y + 8, { width: colWidths.capacidad, align: 'center' });
        x += colWidths.capacidad;
        doc.text('DOCENTE', x, y + 8, { width: colWidths.docente, align: 'center' });
        x += colWidths.docente;
        doc.text('AULA', x, y + 8, { width: colWidths.aula, align: 'center' });
      };

      // Dibujar primer encabezado
      dibujarEncabezadoTabla(tableTop);

      let yPos = tableTop + 30;

      // Filas de datos
      datos.forEach((curso, index) => {
        // Verificar si necesitamos nueva página
        if (yPos > doc.page.height - 120) {
          doc.addPage();
          yPos = 40;
          dibujarEncabezadoTabla(yPos);
          yPos += 30;
        }

        // Fondo alternado
        if (index % 2 === 0) {
          doc.rect(40, yPos - 5, doc.page.width - 80, 20)
            .fillColor('#f9f9f9')
            .fill();
        }

        // Bordes de celda
        doc.lineWidth(0.5).strokeColor(colors.border);
        let xTmp = 40;
        Object.values(colWidths).forEach(width => {
          doc.rect(xTmp, yPos - 5, width, 20).stroke();
          xTmp += width;
        });

        xPos = 40;

        doc.fontSize(7.5)
          .fillColor(colors.text)
          .font('Helvetica');

        // Índice (#)
        doc.text((index + 1).toString(), xPos, yPos, { width: colWidths.indice, align: 'center' });
        xPos += colWidths.indice;

        // Código
        doc.font('Helvetica').text(curso.codigo_curso || 'N/A', xPos, yPos, { width: colWidths.codigo, align: 'center' });
        xPos += colWidths.codigo;

        // Nombre del curso
        doc.text(curso.nombre_curso, xPos, yPos, { width: colWidths.nombre, align: 'center' });
        xPos += colWidths.nombre;

        // Horario
        const horarioTexto = (curso.horario || 'N/A').toUpperCase();
        doc.text(horarioTexto, xPos, yPos, { width: colWidths.horario, align: 'center' });
        xPos += colWidths.horario;

        // Capacidad
        const capacidad = `${curso.total_estudiantes}/${curso.capacidad_maxima}`;
        doc.text(capacidad, xPos, yPos, { width: colWidths.capacidad, align: 'center' });
        xPos += colWidths.capacidad;

        // Docente
        const docente = curso.docente_nombres ? `${curso.docente_nombres} ${curso.docente_apellidos || ''}` : 'N/A';
        doc.text(docente, xPos, yPos, { width: colWidths.docente, align: 'center' });
        xPos += colWidths.docente;

        // Aula
        doc.text(curso.aula_nombre || 'N/A', xPos, yPos, { width: colWidths.aula, align: 'center' });

        yPos += 20;
      });

      // FOOTER
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);

        doc.strokeColor(colors.border)
          .lineWidth(1)
          .moveTo(40, doc.page.height - 50)
          .lineTo(doc.page.width - 40, doc.page.height - 50)
          .stroke();

        doc.fontSize(8)
          .fillColor(colors.textGray)
          .font('Helvetica')
          .text(
            'Sistema de Gestión Académica - Escuela de Belleza Jessica Vélez',
            40,
            doc.page.height - 40,
            { align: 'center', width: doc.page.width - 80 }
          );

        doc.text(
          `Página ${i + 1} de ${pages.count}`,
          0,
          doc.page.height - 30,
          { align: 'center' }
        );
      }

      // RESUMEN DE CURSOS
      doc.addPage();
      doc.fontSize(16).fillColor(colors.primary).font('Helvetica-Bold').text('RESUMEN DE CURSOS', { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(11).fillColor(colors.dark).text('ESTADÍSTICAS GENERALES', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor(colors.text).font('Helvetica').text('Total Cursos: ', { continued: true }).font('Helvetica-Bold').text(`${estadisticas.total_cursos || 0}`);
      doc.font('Helvetica').text('Cursos Activos: ', { continued: true }).fillColor(colors.success).font('Helvetica-Bold').text(`${estadisticas.cursos_activos || 0}`);
      doc.fillColor(colors.text).font('Helvetica').text('Estudiantes Inscritos: ', { continued: true }).font('Helvetica-Bold').text(`${estadisticas.total_estudiantes_inscritos || 0}`);
      const promedioOcupacion = estadisticas.total_cursos > 0 ? ((estadisticas.total_estudiantes_inscritos / (estadisticas.promedio_capacidad * estadisticas.total_cursos)) * 100).toFixed(1) : 0;
      doc.font('Helvetica').text('Ocupación Promedio: ', { continued: true }).fillColor(colors.primary).font('Helvetica-Bold').text(`${promedioOcupacion}%`);
      doc.moveDown(1);
      doc.fontSize(11).fillColor(colors.dark).font('Helvetica-Bold').text('ANÁLISIS', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor(colors.textGray).font('Helvetica').text('• Cursos con alta demanda requieren más secciones.');
      doc.text('• Cursos con baja ocupación necesitan promoción.');
      doc.text('• Revisar horarios para optimizar la asistencia.');

      doc.end();
    } catch (error) {
      console.error('Error generando PDF de cursos:', error);
      reject(error);
    }
  });
}

module.exports = {
  generarPDFEstudiantes,
  generarPDFFinanciero,
  generarPDFCursos
};
