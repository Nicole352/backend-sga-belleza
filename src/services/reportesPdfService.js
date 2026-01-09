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

      // Colores en blanco y negro (sin colores)
      const colors = {
        primary: '#000000',      // Negro
        dark: '#000000',         // Negro
        text: '#000000',         // Texto negro (antes gris oscuro)
        textGray: '#000000',     // Negro (antes gris)
        border: '#000000',       // Borde negro (antes gris claro)
        success: '#000000',      // Negro
        error: '#000000'         // Negro
      };

      // Descargar logo
      const logoBuffer = await descargarLogo();

      // Función para dibujar encabezado completo (logo + título + institución)
      const dibujarEncabezadoCompleto = (yInicio = 15) => {
        if (logoBuffer) {
          doc.image(logoBuffer, doc.page.width - 90, yInicio, { width: 50 });

          // Nombre de la institución debajo del logo
          doc.fontSize(6)
            .font('Helvetica-Bold')
            .fillColor(colors.dark)
            .text('ESCUELA DE BELLEZA', doc.page.width - 100, yInicio + 55, { width: 70, align: 'center' })
            .text('JESSICA VÉLEZ', doc.page.width - 100, yInicio + 63, { width: 70, align: 'center' });
        }

        doc.fontSize(10)
          .fillColor(colors.dark)
          .font('Helvetica-Bold')
          .text('REPORTE DE ESTUDIANTES', 40, yInicio + 5, { align: 'left' });

        doc.fontSize(8)
          .fillColor(colors.text)
          .font('Helvetica')
          .text(`GENERADO EL: ${formatearFecha(new Date()).toUpperCase()}`, 40, yInicio + 17, { align: 'left' });

        return yInicio + 85;
      };

      // Dibujar primer encabezado completo
      doc.y = dibujarEncabezadoCompleto(15);

      // (Línea separadora eliminada a petición del usuario)

      doc.moveDown(0.8);

      // ========================================
      // INFORMACIÓN DEL PERÍODO Y FILTROS
      // ========================================
      doc.fontSize(9)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('PERÍODO DEL REPORTE', { underline: false });

      doc.moveDown(0.5);

      doc.fontSize(8)
        .font('Helvetica')
        .fillColor(colors.text)
        .text(`DESDE: ${formatearFecha(filtros.fechaInicio).toUpperCase()}`, { continued: true })
        .text(`     HASTA: ${formatearFecha(filtros.fechaFin).toUpperCase()}`);

      if (filtros.estado && filtros.estado !== 'todos') {
        doc.text(`ESTADO: ${filtros.estado.toUpperCase()}`);
      }

      if (filtros.nombreCurso) {
        doc.text(`CURSO: ${filtros.nombreCurso.toUpperCase()}`);
      }

      doc.moveDown(1);

      // ========================================
      // TABLA DE ESTUDIANTES
      // ========================================
      doc.fontSize(9)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('LISTADO DE ESTUDIANTES', { underline: false });

      doc.moveDown(0.5);

      const colWidths = {
        indice: 25,
        cedula: 80,
        nombre: 135,
        curso: 110,
        fecha: 85,
        estado: 80 // Se ajustará
      };
      colWidths.estado = (doc.page.width - 80) - (colWidths.indice + colWidths.cedula + colWidths.nombre + colWidths.curso + colWidths.fecha);

      // (Línea separadora eliminada)

      const dibujarEncabezadoTabla = (y) => {
        let x = 40;
        // Fondo blanco con bordes negros (ahorro de tinta)
        doc.rect(40, y, doc.page.width - 80, 25)
          .fillAndStroke('#FFFFFF', colors.dark);

        doc.fontSize(8).fillColor(colors.dark).font('Helvetica-Bold');

        doc.text('#', x, y + 8, { width: colWidths.indice, align: 'center' });
        x += colWidths.indice;
        doc.text('IDENTIFICACIÓN', x, y + 8, { width: colWidths.cedula, align: 'center' });
        x += colWidths.cedula;
        doc.text('NOMBRE COMPLETO', x, y + 8, { width: colWidths.nombre, align: 'center' });
        x += colWidths.nombre;
        doc.text('CURSO', x, y + 8, { width: colWidths.curso, align: 'center' });
        x += colWidths.curso;
        doc.text('FECHA INSC.', x, y + 8, { width: colWidths.fecha, align: 'center' });
        x += colWidths.fecha;
        doc.text('ESTADO', x, y + 8, { width: colWidths.estado, align: 'center' });
      };

      // Dibujar primer encabezado de tabla
      const tableTop = doc.y;
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
          // Calcular altura dinámica basada en el nombre para evitar que se vea apretado
          const nombreCompleto = `${todosLosCursosEst[0].nombre} ${todosLosCursosEst[0].apellido}`.toUpperCase();
          const alturaNombre = doc.heightOfString(nombreCompleto, { width: colWidths.nombre });
          // Si es solo 1 curso, ajustamos la altura al texto + padding (12pt). Si son más, 20pt suele sobrar.
          let rowHeight = 20;
          if (cursosRestantes.length === 1) {
            rowHeight = Math.max(20, alturaNombre + 12);
          }

          // Determinar cuántos cursos caben en la página actual
          let yEspacioDisponible = doc.page.height - 100 - yPos;
          let numCursosQueCaben = Math.floor(yEspacioDisponible / rowHeight);

          if (numCursosQueCaben <= 0) {
            doc.addPage();
            // Dibujar encabezado completo en nueva página
            // La función dibujarEncabezadoCompleto está definida en el scope superior de generarPDFEstudiantes
            yPos = dibujarEncabezadoCompleto(15);
            dibujarEncabezadoTabla(yPos);
            yPos += 30;
            yEspacioDisponible = doc.page.height - 100 - yPos;
            numCursosQueCaben = Math.floor(yEspacioDisponible / rowHeight);
          }

          const cursosEnEstaPagina = cursosRestantes.splice(0, Math.min(numCursosQueCaben, cursosRestantes.length));
          const alturaBloque = cursosEnEstaPagina.length * rowHeight;
          const yInicioBloque = yPos;

          // 1. Dibujar filas de cursos (columnas derecha)
          cursosEnEstaPagina.forEach((estudiante, cIdx) => {
            // Bordes de columnas de curso (siempre por fila)
            doc.lineWidth(0.5).strokeColor(colors.border);
            let xTmp = 40 + colWidths.indice + colWidths.cedula + colWidths.nombre;
            [colWidths.curso, colWidths.fecha, colWidths.estado].forEach(width => {
              doc.rect(xTmp, yPos - 5, width, rowHeight).stroke(); // Use dynamic height
              xTmp += width;
            });

            const xContenidoCurso = 40 + colWidths.indice + colWidths.cedula + colWidths.nombre;
            let currentX = xContenidoCurso;
            doc.fontSize(7.5).fillColor(colors.text).font('Helvetica');

            // Calcular centro vertical para texto de curso
            const yCentroCurso = yPos - 5 + (rowHeight / 2);

            // Curso
            doc.text(estudiante.nombre_curso ? estudiante.nombre_curso.toUpperCase() : 'N/A', currentX, yCentroCurso - 4, { width: colWidths.curso, align: 'center' });
            currentX += colWidths.curso;

            // Fecha inscripción
            const fechaInsc = estudiante.fecha_inscripcion ? new Date(estudiante.fecha_inscripcion).toLocaleDateString('es-ES') : 'N/A';
            doc.text(fechaInsc, currentX, yCentroCurso - 4, { width: colWidths.fecha, align: 'center' });
            currentX += colWidths.fecha;

            // Estado con color (CORREGIDO: Eliminado amarillo)
            let estadoColor = colors.text;
            if (estudiante.estado_academico === 'aprobado') estadoColor = colors.success;
            if (estudiante.estado_academico === 'reprobado') estadoColor = colors.error;
            if (estudiante.estado_academico === 'retirado') estadoColor = colors.text; // Fixed: Yellow removed

            doc.fillColor(estadoColor).font('Helvetica-Bold')
              .text(estudiante.estado_academico ? estudiante.estado_academico.toUpperCase() : 'N/A', currentX, yCentroCurso - 4, { width: colWidths.estado, align: 'center' });

            yPos += rowHeight;
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
            .text(`${primerEst.apellido} ${primerEst.nombre}`.toUpperCase(), xCont, yCentro - 4, { width: colWidths.nombre, align: 'center' });
        }
        indiceGlobal++;
      });

      // ========================================
      // PÁGINA DE RESUMEN DETALLADO
      // ========================================
      doc.addPage();

      if (logoBuffer) {
        doc.image(logoBuffer, doc.page.width - 90, 15, { width: 50 });
        doc.fontSize(6).font('Helvetica-Bold').fillColor(colors.dark)
          .text('ESCUELA DE BELLEZA', doc.page.width - 100, 70, { width: 70, align: 'center' })
          .text('JESSICA VÉLEZ', doc.page.width - 100, 78, { width: 70, align: 'center' });
      }

      // Título del resumen
      doc.fontSize(10)
        .fillColor(colors.primary)
        .font('Helvetica-Bold')
        .text('RESUMEN DETALLADO', 0, 100, { align: 'center', width: doc.page.width });

      doc.x = 40; // Reset X to left margin for subsequent text

      doc.moveDown(1);

      // Información del período
      doc.fontSize(9)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('PERÍODO DEL REPORTE', { underline: false });

      doc.moveDown(0.5);
      doc.fontSize(8)
        .fillColor(colors.text)
        .font('Helvetica')
        .text(`DESDE: ${formatearFecha(filtros.fechaInicio).toUpperCase()}`);
      doc.text(`HASTA: ${formatearFecha(filtros.fechaFin).toUpperCase()}`);

      if (filtros.estado && filtros.estado !== 'todos') {
        doc.text(`ESTADO FILTRADO: ${filtros.estado.toUpperCase()}`);
      }

      doc.moveDown(1);

      // Estadísticas generales
      doc.fontSize(10)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('ESTADÍSTICAS GENERALES', { underline: false });

      doc.moveDown(0.2);

      const stats = [
        { label: 'TOTAL DE ESTUDIANTES:', value: estadisticas.total_estudiantes || 0, color: colors.text },
        { label: 'ESTUDIANTES ACTIVOS:', value: estadisticas.activos || 0, color: colors.text },
        { label: 'ESTUDIANTES APROBADOS:', value: estadisticas.aprobados || 0, color: colors.text },
        { label: 'ESTUDIANTES REPROBADOS:', value: estadisticas.reprobados || 0, color: colors.text },
        { label: 'ESTUDIANTES RETIRADOS:', value: estadisticas.retirados || 0, color: colors.text }, // Color fixed to black
        { label: 'ESTUDIANTES GRADUADOS:', value: estadisticas.graduados || 0, color: colors.text },
        { label: 'PROMEDIO DE NOTAS:', value: estadisticas.promedio_notas ? parseFloat(estadisticas.promedio_notas).toFixed(2) : 'N/A', color: colors.text }
      ];

      stats.forEach(stat => {
        doc.fontSize(8) // Reduced from 10 to 8
          .fillColor(colors.text)
          .font('Helvetica')
          .text(stat.label, { continued: true })
          .fillColor(colors.text) // Forced black for bold part too
          .font('Helvetica-Bold')
          .text(` ${stat.value}`);
      });

      doc.moveDown(0.5);

      // Análisis de rendimiento
      doc.fontSize(9) // Reduced header size
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('ANÁLISIS DE RENDIMIENTO', { underline: false });

      doc.moveDown(0.2);

      const totalEstudiantes = estadisticas.total_estudiantes || 0;
      const tasaAprobacion = totalEstudiantes > 0 ? ((estadisticas.aprobados / totalEstudiantes) * 100).toFixed(1) : 0;
      const tasaRetencion = totalEstudiantes > 0 ? (((totalEstudiantes - (estadisticas.retirados || 0)) / totalEstudiantes) * 100).toFixed(1) : 0;

      doc.fontSize(8) // Reduced text size
        .fillColor(colors.text)
        .font('Helvetica')
        .text(`TASA DE APROBACIÓN: `, { continued: true })
        .fillColor(colors.text) // Forced black
        .font('Helvetica-Bold')
        .text(`${tasaAprobacion}%`);

      doc.fillColor(colors.text)
        .font('Helvetica')
        .text(`TASA DE RETENCIÓN: `, { continued: true })
        .fillColor(colors.text) // Forced black
        .font('Helvetica-Bold')
        .text(`${tasaRetencion}%`);

      doc.moveDown(0.5);

      // Observaciones
      doc.fontSize(9)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('OBSERVACIONES', { underline: false });

      doc.moveDown(0.2);
      doc.fontSize(7) // Even smaller for fine print
        .fillColor(colors.textGray)
        .font('Helvetica')
        .text('• ESTE REPORTE MUESTRA EL ESTADO ACADÉMICO DE LOS ESTUDIANTES EN EL PERÍODO SELECCIONADO.');
      doc.text('• LOS DATOS REFLEJAN LA INFORMACIÓN ACTUALIZADA AL MOMENTO DE LA GENERACIÓN DEL REPORTE.');
      doc.text('• PARA MÁS DETALLES, CONSULTE EL SISTEMA DE GESTIÓN ACADÉMICA.');

      // ========================================
      // FOOTER EN TODAS LAS PÁGINAS
      // ========================================
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);

        // Línea superior del footer
        doc.strokeColor(colors.border)
          .lineWidth(1)
          .moveTo(40, doc.page.height - 50)
          .lineTo(doc.page.width - 40, doc.page.height - 50)
          .stroke();

        // Footer Izquierdo: Escuela de Belleza Jessica Vélez
        doc.fontSize(10)
          .fillColor(colors.dark)
          .font('Helvetica-Bold')
          .text('Escuela de Belleza Jessica Vélez', 40, doc.page.height - 40, { align: 'left', width: 250 });

        // Footer Derecho: Descargado... Pág X de Y
        const fechaDescarga = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
        doc.fontSize(8)
          .fillColor(colors.text)
          .font('Helvetica')
          .text(
            `Descargado: ${fechaDescarga} — Pág. ${i + 1} de ${pages.count}`,
            doc.page.width - 300,
            doc.page.height - 40,
            { align: 'right', width: 260 }
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
        primary: '#000000',      // Negro
        dark: '#000000',         // Negro
        text: '#000000',         // Texto negro (antes gris oscuro)
        textGray: '#000000',     // Negro (antes gris)
        border: '#000000',       // Borde negro (antes gris claro)
        success: '#000000',      // Negro
        error: '#000000'         // Negro
      };

      // Descargar logo
      const logoBuffer = await descargarLogo();

      // Función para dibujar encabezado completo (logo + título + institución)
      const dibujarEncabezadoCompleto = (yInicio = 15) => {
        if (logoBuffer) {
          doc.image(logoBuffer, doc.page.width - 90, yInicio, { width: 50 });

          // Nombre de la institución debajo del logo
          doc.fontSize(6)
            .font('Helvetica-Bold')
            .fillColor(colors.dark)
            .text('ESCUELA DE BELLEZA', doc.page.width - 100, yInicio + 55, { width: 70, align: 'center' })
            .text('JESSICA VÉLEZ', doc.page.width - 100, yInicio + 63, { width: 70, align: 'center' });
        }

        doc.fontSize(10)
          .fillColor(colors.dark)
          .font('Helvetica-Bold')
          .text('REPORTE FINANCIERO', 40, yInicio + 5, { align: 'left' });

        doc.fontSize(8)
          .fillColor(colors.text)
          .font('Helvetica')
          .text(`GENERADO EL: ${formatearFecha(new Date()).toUpperCase()}`, 40, yInicio + 17, { align: 'left' });

        return yInicio + 85;
      };

      // Dibujar primer encabezado completo
      doc.y = dibujarEncabezadoCompleto(15);

      // (Línea separadora eliminada a petición del usuario)

      doc.moveDown(0.8);

      // PERÍODO
      doc.fontSize(9)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('PERÍODO DEL REPORTE', { underline: false });

      doc.moveDown(0.5);

      doc.fontSize(8)
        .font('Helvetica')
        .fillColor(colors.text)
        .text(`DESDE: ${formatearFecha(filtros.fechaInicio).toUpperCase()}`, { continued: true })
        .text(`     HASTA: ${formatearFecha(filtros.fechaFin).toUpperCase()}`);

      doc.moveDown(1);

      // TABLA DE PAGOS
      doc.fontSize(9)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('DETALLE DE PAGOS', { underline: false });

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

      // (Línea separadora eliminada)

      const dibujarEncabezadoTabla = (y) => {
        let x = 40;
        // Fondo blanco con bordes negros (ahorro de tinta)
        doc.rect(40, y, doc.page.width - 80, 25)
          .fillAndStroke('#FFFFFF', colors.dark);

        doc.fontSize(8).fillColor(colors.dark).font('Helvetica-Bold');

        doc.text('#', x, y + 8, { width: colWidths.indice, align: 'center' });
        x += colWidths.indice;
        doc.text('IDENTIFICACIÓN', x, y + 8, { width: colWidths.cedula, align: 'center' });
        x += colWidths.cedula;
        doc.text('NOMBRE COMPLETO', x, y + 8, { width: colWidths.nombre, align: 'center' });
        x += colWidths.nombre;
        doc.text('CURSO', x, y + 8, { width: colWidths.curso, align: 'center' });
        x += colWidths.curso;
        doc.text('MONTO', x, y + 8, { width: colWidths.monto, align: 'center' });
        x += colWidths.monto;
        doc.text('FECHA', x, y + 8, { width: colWidths.fecha, align: 'center' });
        x += colWidths.fecha;
        doc.text('MÉT.', x, y + 8, { width: colWidths.metodo, align: 'center' });
        x += colWidths.metodo;
        doc.text('EST.', x, y + 8, { width: colWidths.estado, align: 'center' });
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

      let yPos = tableTop + 30;
      let indiceGlobal = 1;

      identificacionesOrdenadas.forEach((id) => {
        const todosLosPagosEstudiante = pagosAgrupados[id];
        let pagosRestantes = [...todosLosPagosEstudiante];

        while (pagosRestantes.length > 0) {
          // Calcular altura dinámica por si el nombre es muy largo (aunque 32 es generoso)
          const nombreCompleto = `${todosLosPagosEstudiante[0].nombre_estudiante} ${todosLosPagosEstudiante[0].apellido_estudiante}`.toUpperCase();
          const alturaNombre = doc.heightOfString(nombreCompleto, { width: colWidths.nombre });
          // Altura base 32. Si el nombre excede, expandimos.
          let rowHeight = 32;
          if (pagosRestantes.length === 1) {
            rowHeight = Math.max(32, alturaNombre + 12);
          }

          // Determinar cuántos pagos del estudiante caben en la página actual
          let yEspacioDisponible = doc.page.height - 100 - yPos;
          let numPagosQueCaben = Math.floor(yEspacioDisponible / rowHeight);

          if (numPagosQueCaben <= 0) {
            doc.addPage();
            // Dibujar encabezado completo en nueva página
            yPos = dibujarEncabezadoCompleto(15);
            dibujarEncabezadoTabla(yPos);
            yPos += 30;
            yEspacioDisponible = doc.page.height - 100 - yPos;
            numPagosQueCaben = Math.floor(yEspacioDisponible / rowHeight);
          }

          const pagosEnEstaPagina = pagosRestantes.splice(0, Math.min(numPagosQueCaben, pagosRestantes.length));
          const alturaBloque = pagosEnEstaPagina.length * rowHeight;
          const yInicioBloque = yPos;

          // 1. Dibujar filas de pagos (columnas de la derecha)
          pagosEnEstaPagina.forEach((pago, pIdx) => {
            // Bordes de las columnas de PAGO (siempre se dibujan por fila)
            doc.lineWidth(0.5).strokeColor(colors.border);
            let xTmp = 40 + colWidths.indice + colWidths.cedula + colWidths.nombre;
            [colWidths.curso, colWidths.monto, colWidths.fecha, colWidths.metodo, colWidths.estado].forEach(width => {
              doc.rect(xTmp, yPos - 5, width, rowHeight).stroke();
              xTmp += width;
            });

            const xContenidoPago = 40 + colWidths.indice + colWidths.cedula + colWidths.nombre;
            let currentX = xContenidoPago;

            doc.fontSize(7.5).fillColor(colors.text).font('Helvetica');

            // Calcular centro vertical
            const yCentroRow = yPos - 5 + (rowHeight / 2);

            // Curso
            const cursoNombre = pago.nombre_curso ? pago.nombre_curso.toUpperCase() : 'N/A';
            const cursoCorto = cursoNombre.length > 20 ? cursoNombre.substring(0, 18) + '...' : cursoNombre;
            doc.text(cursoCorto, currentX, yCentroRow - 4, { width: colWidths.curso, align: 'center' });
            currentX += colWidths.curso;

            // Monto
            doc.text(formatearMoneda(pago.monto), currentX, yCentroRow - 4, { width: colWidths.monto, align: 'center' });
            currentX += colWidths.monto;

            // Fecha
            let fechaMostrar = 'N/A';
            if (pago.fecha_pago) {
              fechaMostrar = new Date(pago.fecha_pago).toLocaleDateString('es-ES');
            } else if (pago.fecha_vencimiento) {
              fechaMostrar = new Date(pago.fecha_vencimiento).toLocaleDateString('es-ES');
            }
            doc.text(fechaMostrar, currentX, yCentroRow - 4, { width: colWidths.fecha, align: 'center' });
            currentX += colWidths.fecha;

            // Método
            const metodoPago = (pago.estado_pago === 'verificado' || pago.estado_pago === 'pagado') && pago.metodo_pago
              ? (pago.metodo_pago.length > 9 ? (pago.metodo_pago.substring(0, 8) + '.').toUpperCase() : pago.metodo_pago.toUpperCase())
              : 'PEND.';
            doc.text(metodoPago, currentX, yCentroRow - 4, { width: colWidths.metodo, align: 'center' });
            currentX += colWidths.metodo;

            // Estado
            let estadoColor = colors.text;
            if (pago.estado_pago === 'verificado') estadoColor = colors.success;
            if (pago.estado_pago === 'pendiente') estadoColor = colors.error;
            doc.fillColor(estadoColor).font('Helvetica-Bold')
              .text(pago.estado_pago.substring(0, 3).toUpperCase() + '.', currentX, yCentroRow - 4, { width: colWidths.estado, align: 'center' });

            yPos += rowHeight;
          });

          // 2. Dibujar celdas "combinadas" (columnas de la izquierda)
          doc.lineWidth(0.5).strokeColor(colors.border);
          let xEst = 40;

          // Bordes de bloque para #, Cédula, Nombre
          [colWidths.indice, colWidths.cedula, colWidths.nombre].forEach(width => {
            doc.rect(xEst, yInicioBloque - 5, width, alturaBloque).stroke();
            xEst += width;
          });

          // Contenido centrado verticalmente
          const primerPago = pagosEnEstaPagina[0];
          const yCentro = yInicioBloque - 5 + (alturaBloque / 2);

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

          // Nombre (Apellido + Nombre)
          const nombreText = `${primerPago.apellido_estudiante || ''}\n${primerPago.nombre_estudiante || ''}`.toUpperCase();
          doc.font('Helvetica-Bold').fontSize(7)
            .text(nombreText, xCont, yCentro - 6, { width: colWidths.nombre, align: 'center' });
        }
        indiceGlobal++;
      });

      // RESUMEN FINANCIERO
      doc.addPage();

      if (logoBuffer) {
        doc.image(logoBuffer, doc.page.width - 90, 15, { width: 50 });
        doc.fontSize(6).font('Helvetica-Bold').fillColor(colors.dark)
          .text('ESCUELA DE BELLEZA', doc.page.width - 100, 70, { width: 70, align: 'center' })
          .text('JESSICA VÉLEZ', doc.page.width - 100, 78, { width: 70, align: 'center' });
      }

      doc.fontSize(10).fillColor(colors.primary).font('Helvetica-Bold')
        .text('RESUMEN FINANCIERO', 0, 100, { align: 'center', width: doc.page.width });

      doc.x = 40; // Reset X
      doc.moveDown(1);

      // ESTADÍSTICAS GENERALES
      doc.fontSize(10)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('ESTADÍSTICAS GENERALES', { underline: false });

      doc.moveDown(0.2);

      const ingresosTotales = parseFloat(estadisticas.ingresos_totales || 0);
      const promedioPago = parseFloat(estadisticas.promedio_pago || 0);

      const stats = [
        { label: 'TOTAL DE PAGOS:', value: estadisticas.total_pagos || 0 },
        { label: 'PAGOS VERIFICADOS:', value: estadisticas.pagos_verificados || 0 },
        { label: 'PAGOS PENDIENTES:', value: estadisticas.pagos_pendientes || 0 },
        { label: 'INGRESOS TOTALES:', value: formatearMoneda(ingresosTotales) },
        { label: 'PROMEDIO DE PAGO:', value: formatearMoneda(promedioPago) }
      ];

      stats.forEach(stat => {
        doc.fontSize(8)
          .fillColor(colors.text)
          .font('Helvetica')
          .text(stat.label, { continued: true })
          .fillColor(colors.text)
          .font('Helvetica-Bold')
          .text(` ${stat.value}`);
      });

      doc.moveDown(0.5);

      // Observaciones
      doc.fontSize(9)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('OBSERVACIONES', { underline: false });

      doc.moveDown(0.2);
      doc.fontSize(7)
        .fillColor(colors.textGray)
        .font('Helvetica')
        .text('• ESTE REPORTE MUESTRA EL ESTADO FINANCIERO DEL PERÍODO SELECCIONADO.');
      doc.text('• LOS MONTOS REFLEJAN LOS PAGOS REGISTRADOS EN EL SISTEMA ADMINISTRATIVO.');
      doc.text('• PARA CONCILIACIONES BANCARIAS, USE LOS REPORTES DETALLADOS POR CUENTAS.');

      doc.moveDown(1);

      // RESUMEN DE CURSOS (SOLO SI SE SOLICITA O COMO PARTE DEL FINANCIERO)
      doc.addPage();

      if (logoBuffer) {
        doc.image(logoBuffer, doc.page.width - 90, 15, { width: 50 });
        doc.fontSize(6).font('Helvetica-Bold').fillColor(colors.dark)
          .text('ESCUELA DE BELLEZA', doc.page.width - 100, 70, { width: 70, align: 'center' })
          .text('JESSICA VÉLEZ', doc.page.width - 100, 78, { width: 70, align: 'center' });
      }

      doc.fontSize(10).fillColor(colors.primary).font('Helvetica-Bold')
        .text('RESUMEN DE CURSOS', 0, 100, { align: 'center', width: doc.page.width });

      doc.x = 40; // Reset X
      doc.moveDown(1);

      // ESTADÍSTICAS
      doc.fontSize(9).fillColor(colors.dark).text('ESTADÍSTICAS GENERALES', { underline: true });
      doc.moveDown(0.5);

      const totalCursos = estadisticas.total_cursos || 0;
      const cursosActivos = estadisticas.cursos_activos || 0;
      const totalInscritos = estadisticas.total_estudiantes_inscritos || 0;
      const promedioOcupacion = totalCursos > 0 ? ((totalInscritos / (estadisticas.promedio_capacidad * totalCursos)) * 100).toFixed(1) : 0;

      doc.fontSize(9).fillColor(colors.text).font('Helvetica').text('TOTAL CURSOS: ', { continued: true }).font('Helvetica-Bold').text(`${totalCursos}`);
      doc.font('Helvetica').text('ACTIVOS: ', { continued: true }).fillColor(colors.success).font('Helvetica-Bold').text(`${cursosActivos}`);
      doc.fillColor(colors.text).font('Helvetica').text('TOTAL INSCRITOS: ', { continued: true }).font('Helvetica-Bold').text(`${totalInscritos}`);
      doc.font('Helvetica').text('OCUPACIÓN PROMEDIO: ', { continued: true }).font('Helvetica-Bold').text(`${promedioOcupacion}%`);

      doc.moveDown(1);

      // (Resto de la lógica de estudiantes pendientes omitida por brevedad en este chunk para mover el footer al final)

      doc.moveDown(1);

      // ESTUDIANTES CON PAGOS PENDIENTES
      doc.fontSize(9).fillColor(colors.dark).font('Helvetica-Bold').text('ESTUDIANTES CON PAGOS PENDIENTES', { underline: true });
      doc.moveDown(0.5);

      // Agrupar pagos por estudiante (todos los pagos)
      const estudiantesPendientes = {};
      datos.forEach(pago => {
        const key = pago.cedula_estudiante || pago.nombre_estudiante;

        // Inicializar si no existe
        if (!estudiantesPendientes[key]) {
          estudiantesPendientes[key] = {
            nombre: `${pago.apellido_estudiante} ${pago.nombre_estudiante}`,
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
          .text(`MOSTRANDO ${maxEstudiantes} DE ${listaEstudiantes.length} ESTUDIANTES CON PAGOS PENDIENTES`);
        doc.moveDown(0.3);

        listaEstudiantes.slice(0, maxEstudiantes).forEach((est, index) => {
          // Verificar si necesitamos nueva página
          if (doc.y > doc.page.height - 120) {
            doc.addPage();
            doc.fontSize(9).fillColor(colors.dark).font('Helvetica-Bold')
              .text('ESTUDIANTES CON PAGOS PENDIENTES (CONTINUACIÓN)', { underline: true });
            doc.moveDown(0.5);
          }

          doc.fontSize(9).fillColor(colors.text).font('Helvetica-Bold')
            .text(`${index + 1}. ${est.nombre}`, { continued: true })
            .fillColor(colors.textGray).font('Helvetica')
            .text(` (${est.cedula || 'SIN CÉDULA'})`);

          doc.fontSize(8).fillColor(colors.textGray)
            .text(`   CURSO: ${est.curso.toUpperCase()}`);

          doc.fillColor(colors.success).font('Helvetica-Bold')
            .text(`   PAGOS VERIFICADOS: ${est.cuotasVerificadas}`, { continued: true })
            .fillColor(colors.text).font('Helvetica')
            .text(` | MONTO: ${formatearMoneda(est.montoVerificado)}`);

          doc.fillColor(colors.error).font('Helvetica-Bold')
            .text(`   CUOTAS PENDIENTES: ${est.cuotasPendientes}`, { continued: true })
            .fillColor(colors.text).font('Helvetica')
            .text(` | MONTO: ${formatearMoneda(est.montoPendiente)}`);

          doc.moveDown(0.3);
        });

        if (listaEstudiantes.length > maxEstudiantes) {
          doc.fontSize(8).fillColor(colors.textGray).font('Helvetica-Oblique')
            .text(`... Y ${listaEstudiantes.length - maxEstudiantes} ESTUDIANTES MÁS CON PAGOS PENDIENTES.`);
        }
      } else {
        doc.fontSize(9).fillColor(colors.success).font('Helvetica-Bold')
          .text('¡EXCELENTE! NO HAY ESTUDIANTES CON PAGOS PENDIENTES EN ESTE PERÍODO.');
      }

      // ========================================
      // FOOTER EN TODAS LAS PÁGINAS
      // ========================================
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);

        // Línea superior del footer
        doc.strokeColor(colors.border)
          .lineWidth(1)
          .moveTo(40, doc.page.height - 50)
          .lineTo(doc.page.width - 40, doc.page.height - 50)
          .stroke();

        // Footer Izquierdo
        doc.fontSize(10)
          .fillColor(colors.dark)
          .font('Helvetica-Bold')
          .text('Escuela de Belleza Jessica Vélez', 40, doc.page.height - 40, { align: 'left', width: 250 });

        // Footer Derecho
        const fechaDescarga = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
        doc.fontSize(8)
          .fillColor(colors.text)
          .font('Helvetica')
          .text(
            `Descargado: ${fechaDescarga} — Pág. ${i + 1} de ${pages.count}`,
            doc.page.width - 300,
            doc.page.height - 40,
            { align: 'right', width: 260 }
          );
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
        primary: '#000000',      // Negro
        dark: '#000000',         // Negro
        text: '#000000',         // Texto negro
        textGray: '#000000',     // Negro (antes gris)
        border: '#000000',       // Borde negro
        success: '#000000',      // Negro
        error: '#000000'         // Negro
      };

      // Descargar logo
      const logoBuffer = await descargarLogo();

      // Función para dibujar encabezado completo (logo + título + institución)
      const dibujarEncabezadoCompleto = (yInicio = 15) => {
        if (logoBuffer) {
          doc.image(logoBuffer, doc.page.width - 90, yInicio, { width: 50 });

          // Nombre de la institución debajo del logo
          doc.fontSize(6)
            .font('Helvetica-Bold')
            .fillColor(colors.dark)
            .text('ESCUELA DE BELLEZA', doc.page.width - 100, yInicio + 55, { width: 70, align: 'center' })
            .text('JESSICA VÉLEZ', doc.page.width - 100, yInicio + 63, { width: 70, align: 'center' });
        }

        doc.fontSize(10)
          .fillColor(colors.dark)
          .font('Helvetica-Bold')
          .text('REPORTE DE CURSOS', 40, yInicio + 5, { align: 'left' });

        doc.fontSize(8)
          .fillColor(colors.text)
          .font('Helvetica')
          .text(`GENERADO EL: ${formatearFecha(new Date()).toUpperCase()}`, 40, yInicio + 17, { align: 'left' });

        return yInicio + 85;
      };

      // Dibujar primer encabezado completo
      doc.y = dibujarEncabezadoCompleto(15);

      // TABLA DE CURSOS
      doc.fontSize(9)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('LISTADO DE CURSOS', { underline: false });

      doc.moveDown(0.5);

      // Encabezados de tabla
      const tableTop = doc.y;
      const colWidths = {
        indice: 25,
        codigo: 40,
        docente: 165, // ID + Nombre apilados con buen margen
        nombre: 95,
        horario: 75,
        capacidad: 65, // Aumentado para que "ESTUDIANTES" no se corte
        aula: 50       // Se ajustará
      };
      // Recalcular el último para ajuste fino
      colWidths.aula = (doc.page.width - 80) - (colWidths.indice + colWidths.codigo + colWidths.docente + colWidths.nombre + colWidths.horario + colWidths.capacidad);

      // (Línea separadora eliminada)

      const dibujarEncabezadoTabla = (y) => {
        let x = 40;
        // Fondo blanco con bordes negros (ahorro de tinta)
        doc.rect(40, y, doc.page.width - 80, 25)
          .fillAndStroke('#FFFFFF', colors.dark);

        doc.fontSize(8).fillColor(colors.dark).font('Helvetica-Bold');

        doc.text('#', x, y + 8, { width: colWidths.indice, align: 'center' });
        x += colWidths.indice;
        doc.text('CÓDIGO', x, y + 8, { width: colWidths.codigo, align: 'center' });
        x += colWidths.codigo;
        doc.text('IDENTIFICACIÓN / DOCENTE', x, y + 8, { width: colWidths.docente, align: 'center' });
        x += colWidths.docente;
        doc.text('CURSO', x, y + 8, { width: colWidths.nombre, align: 'center' });
        x += colWidths.nombre;
        doc.text('HORARIO', x, y + 8, { width: colWidths.horario, align: 'center' });
        x += colWidths.horario;
        doc.text('ESTUDIANTES', x, y + 8, { width: colWidths.capacidad, align: 'center' });
        x += colWidths.capacidad;
        doc.text('AULA', x, y + 8, { width: colWidths.aula, align: 'center' });
      };

      // Dibujar primer encabezado
      dibujarEncabezadoTabla(tableTop);

      let yPos = tableTop + 30;

      // Filas de datos
      datos.forEach((curso, index) => {
        // Calcular altura dinámica
        const nombreCurso = (curso.nombre_curso || '').toUpperCase();
        // Formato Docente: Separar Apellidos y Nombres para apilarlos
        const apellidos = (curso.docente_apellidos || '').trim().toUpperCase();
        const nombres = (curso.docente_nombres || '').trim().toUpperCase();
        const docenteIdentificacion = curso.docente_identificacion || 'N/A';

        const alturaNombre = doc.heightOfString(nombreCurso, { width: colWidths.nombre });

        // Medir alturas para apilar ID, Apellidos y Nombres
        const alturaID = doc.heightOfString(docenteIdentificacion, { width: colWidths.docente });
        const alturaApellidos = apellidos ? doc.heightOfString(apellidos, { width: colWidths.docente }) : 0;
        const alturaNombres = nombres ? doc.heightOfString(nombres, { width: colWidths.docente }) : 0;

        const alturaDocenteTotal = alturaID + alturaApellidos + alturaNombres + 4; // +4 de márgenes entre líneas

        // Altura base 20. Si texto excede, expandimos.
        const rowHeight = Math.max(30, alturaNombre + 12, alturaDocenteTotal + 12);

        // Verificar si necesitamos nueva página
        if (yPos + rowHeight > doc.page.height - 50) {
          doc.addPage();
          yPos = dibujarEncabezadoCompleto(15);
          dibujarEncabezadoTabla(yPos);
          yPos += 30;
        }

        // Bordes de celda (con altura dinámica)
        doc.lineWidth(0.5).strokeColor(colors.border);
        let xTmp = 40;
        // Orden de anchos para dibujar rectángulos
        const anchosEnOrden = [colWidths.indice, colWidths.codigo, colWidths.docente, colWidths.nombre, colWidths.horario, colWidths.capacidad, colWidths.aula];
        anchosEnOrden.forEach(width => {
          doc.rect(xTmp, yPos - 5, width, rowHeight).stroke();
          xTmp += width;
        });

        let yCentroRow = yPos - 5 + (rowHeight / 2);
        let xPos = 40;

        doc.fontSize(7.5)
          .fillColor(colors.text)
          .font('Helvetica');

        // Índice (#)
        doc.text((index + 1).toString(), xPos, yCentroRow - 4, { width: colWidths.indice, align: 'center' });
        xPos += colWidths.indice;

        // Código
        doc.font('Helvetica').text(curso.codigo_curso || 'N/A', xPos, yCentroRow - 4, { width: colWidths.codigo, align: 'center' });
        xPos += colWidths.codigo;

        // Docente (Fusión vertical: ID + Apellidos (Bold) + Nombres (Bold))
        let yDocenteBloque = yPos - 5 + (rowHeight - alturaDocenteTotal) / 2;

        // ID (Normal)
        doc.font('Helvetica').fontSize(6.5)
          .text(docenteIdentificacion, xPos, yDocenteBloque, { width: colWidths.docente, align: 'center' });

        let currentY = yDocenteBloque + alturaID + 1;

        // Apellidos (Bold)
        if (apellidos) {
          doc.font('Helvetica-Bold').fontSize(7.5)
            .text(apellidos, xPos, currentY, { width: colWidths.docente, align: 'center' });
          currentY += alturaApellidos + 1;
        }

        // Nombres (Bold)
        if (nombres) {
          doc.font('Helvetica-Bold').fontSize(7.5)
            .text(nombres, xPos, currentY, { width: colWidths.docente, align: 'center' });
        } else if (!apellidos) {
          doc.font('Helvetica-Bold').fontSize(7.5)
            .text('N/A', xPos, currentY, { width: colWidths.docente, align: 'center' });
        }

        xPos += colWidths.docente;

        // Nombre del curso (Movido después de Docente)
        let yTextoNombre = yPos - 5 + (rowHeight - alturaNombre) / 2;
        doc.font('Helvetica').text(nombreCurso, xPos, yTextoNombre, { width: colWidths.nombre, align: 'center' });
        xPos += colWidths.nombre;

        // Horario con intervalo de horas
        const intervalo = (curso.hora_inicio && curso.hora_fin)
          ? `${curso.hora_inicio.toString().substring(0, 5)} - ${curso.hora_fin.toString().substring(0, 5)}`
          : '';
        const horarioCompleto = `${curso.horario || 'N/A'}${intervalo ? '\n' + intervalo : ''}`.toUpperCase();

        doc.text(horarioCompleto, xPos, yCentroRow - (intervalo ? 8 : 4), { width: colWidths.horario, align: 'center' });
        xPos += colWidths.horario;

        // Capacidad
        doc.text(`${curso.total_estudiantes}/${curso.capacidad_maxima}`, xPos, yCentroRow - 4, { width: colWidths.capacidad, align: 'center' });
        xPos += colWidths.capacidad;

        // Aula
        doc.text(curso.aula_nombre || 'N/A', xPos, yCentroRow - 4, { width: colWidths.aula, align: 'center' });

        yPos += rowHeight;
      });

      // ========================================
      // PÁGINA DE RESUMEN DETALLADO
      // ========================================
      doc.addPage();

      if (logoBuffer) {
        doc.image(logoBuffer, doc.page.width - 90, 15, { width: 50 });
        doc.fontSize(6).font('Helvetica-Bold').fillColor(colors.dark)
          .text('ESCUELA DE BELLEZA', doc.page.width - 100, 70, { width: 70, align: 'center' })
          .text('JESSICA VÉLEZ', doc.page.width - 100, 78, { width: 70, align: 'center' });
      }

      // Título del resumen
      doc.fontSize(10)
        .fillColor(colors.primary)
        .font('Helvetica-Bold')
        .text('RESUMEN DETALLADO', 0, 100, { align: 'center', width: doc.page.width });

      doc.x = 40; // Reset X

      doc.moveDown(1);

      // Estadísticas generales
      doc.fontSize(10)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('ESTADÍSTICAS GENERALES', { underline: false });

      doc.moveDown(0.2);

      const totalCursos = estadisticas.total_cursos || 0;
      const inscritos = estadisticas.total_estudiantes_inscritos || 0;
      const promedioOcupacion = totalCursos > 0 ? ((inscritos / (estadisticas.promedio_capacidad * totalCursos)) * 100).toFixed(1) : 0;

      const stats = [
        { label: 'TOTAL DE CURSOS:', value: totalCursos, color: colors.text },
        { label: 'CURSOS ACTIVOS:', value: estadisticas.cursos_activos || 0, color: colors.text },
        { label: 'ESTUDIANTES INSCRITOS:', value: inscritos, color: colors.text },
        { label: 'OCUPACIÓN PROMEDIO:', value: `${promedioOcupacion}%`, color: colors.text }
      ];

      stats.forEach(stat => {
        doc.fontSize(8)
          .fillColor(colors.text)
          .font('Helvetica')
          .text(stat.label, { continued: true })
          .fillColor(colors.text)
          .font('Helvetica-Bold')
          .text(` ${stat.value}`);
      });

      doc.moveDown(0.5);

      // Análisis
      doc.fontSize(9)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('ANÁLISIS DE GESTIÓN', { underline: false });

      doc.moveDown(0.2);

      doc.fontSize(7)
        .fillColor(colors.textGray)
        .font('Helvetica')
        .text('• CURSOS CON ALTA DEMANDA REQUIEREN LA EVALUACIÓN DE NUEVAS SECCIONES.');
      doc.text('• LOS CURSOS CON BAJA OCUPACIÓN NECESITAN ESTRATEGIAS DE PROMOCIÓN FOCALIZADA.');
      doc.text('• SE RECOMIENDA REVISAR LOS HORARIOS PARA OPTIMIZAR LA ASISTENCIA SEGÚN EL CUPO.');

      doc.moveDown(0.5);

      // Observaciones
      doc.fontSize(9)
        .fillColor(colors.dark)
        .font('Helvetica-Bold')
        .text('OBSERVACIONES', { underline: false });

      doc.moveDown(0.2);
      doc.fontSize(7)
        .fillColor(colors.textGray)
        .font('Helvetica')
        .text('• ESTE REPORTE MUESTRA EL ESTADO OPERATIVO DE LOS CURSOS EN EL SISTEMA.');
      doc.text('• LOS DATOS REFLEJAN LA INFORMACIÓN ACTUALIZADA AL MOMENTO DE LA GENERACIÓN DEL REPORTE.');
      doc.text('• PARA DETALLES ESPECÍFICOS POR CURSO, CONSULTE EL PANEL DE ADMINISTRACIÓN.');

      // ========================================
      // FOOTER EN TODAS LAS PÁGINAS
      // ========================================
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);

        // Línea superior del footer
        doc.strokeColor(colors.border)
          .lineWidth(1)
          .moveTo(40, doc.page.height - 50)
          .lineTo(doc.page.width - 40, doc.page.height - 50)
          .stroke();

        // Footer Izquierdo
        doc.fontSize(10)
          .fillColor(colors.dark)
          .font('Helvetica-Bold')
          .text('Escuela de Belleza Jessica Vélez', 40, doc.page.height - 40, { align: 'left', width: 250 });

        // Footer Derecho
        const fechaDescarga = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
        doc.fontSize(8)
          .fillColor(colors.text)
          .font('Helvetica')
          .text(
            `Descargado: ${fechaDescarga} — Pág. ${i + 1} de ${pages.count}`,
            doc.page.width - 300,
            doc.page.height - 40,
            { align: 'right', width: 260 }
          );
      }

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
