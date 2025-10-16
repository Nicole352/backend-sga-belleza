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
    console.error('❌ Error descargando logo:', error.message);
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
        margin: 40,
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

      // ========================================
      // HEADER CON LOGO CENTRADO
      // ========================================
      if (logoBuffer) {
        doc.image(logoBuffer, (doc.page.width - 100) / 2, 40, { width: 100 });
      }

      doc.moveDown(6);

      // Nombre de la institución
      doc.fontSize(20)
         .fillColor(colors.dark)
         .font('Helvetica-Bold')
         .text('ESCUELA DE BELLEZA JESSICA VÉLEZ', { align: 'center' });

      doc.moveDown(0.5);

      // Título del reporte
      doc.fontSize(16)
         .fillColor(colors.primary)
         .text('REPORTE DE ESTUDIANTES', { align: 'center' });

      doc.moveDown(0.3);

      // Fecha de generación
      doc.fontSize(10)
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

      // Encabezados de tabla
      const tableTop = doc.y;
      const colWidths = {
        cedula: 80,
        nombre: 140,
        curso: 120,
        fecha: 80,
        estado: 70
      };

      let xPos = 40;

      // Header de tabla con fondo
      doc.rect(40, tableTop, doc.page.width - 80, 25)
         .fillAndStroke(colors.primary, colors.primary);

      doc.fontSize(9)
         .fillColor(colors.dark)
         .font('Helvetica-Bold');

      doc.text('CÉDULA', xPos + 5, tableTop + 8, { width: colWidths.cedula });
      xPos += colWidths.cedula;
      doc.text('NOMBRE COMPLETO', xPos + 5, tableTop + 8, { width: colWidths.nombre });
      xPos += colWidths.nombre;
      doc.text('CURSO', xPos + 5, tableTop + 8, { width: colWidths.curso });
      xPos += colWidths.curso;
      doc.text('FECHA INSC.', xPos + 5, tableTop + 8, { width: colWidths.fecha });
      xPos += colWidths.fecha;
      doc.text('ESTADO', xPos + 5, tableTop + 8, { width: colWidths.estado });

      let yPos = tableTop + 30;

      // Filas de datos
      datos.forEach((estudiante, index) => {
        // Verificar si necesitamos nueva página
        if (yPos > doc.page.height - 100) {
          doc.addPage();
          yPos = 40;
        }

        // Fondo alternado
        if (index % 2 === 0) {
          doc.rect(40, yPos - 5, doc.page.width - 80, 20)
             .fillColor('#f9f9f9')
             .fill();
        }

        xPos = 40;

        doc.fontSize(8)
           .fillColor(colors.text)
           .font('Helvetica');

        // Cédula
        doc.text(estudiante.cedula || 'N/A', xPos + 5, yPos, { width: colWidths.cedula });
        xPos += colWidths.cedula;

        // Nombre completo
        const nombreCompleto = `${estudiante.nombre} ${estudiante.apellido}`;
        doc.text(nombreCompleto, xPos + 5, yPos, { width: colWidths.nombre });
        xPos += colWidths.nombre;

        // Curso
        doc.text(estudiante.nombre_curso || 'N/A', xPos + 5, yPos, { width: colWidths.curso });
        xPos += colWidths.curso;

        // Fecha inscripción
        const fechaInsc = new Date(estudiante.fecha_inscripcion).toLocaleDateString('es-ES');
        doc.text(fechaInsc, xPos + 5, yPos, { width: colWidths.fecha });
        xPos += colWidths.fecha;

        // Estado con color
        let estadoColor = colors.text;
        if (estudiante.estado_academico === 'aprobado') estadoColor = colors.success;
        if (estudiante.estado_academico === 'reprobado') estadoColor = colors.error;
        if (estudiante.estado_academico === 'retirado') estadoColor = '#f59e0b';

        doc.fillColor(estadoColor)
           .font('Helvetica-Bold')
           .text(estudiante.estado_academico.toUpperCase(), xPos + 5, yPos, { width: colWidths.estado });

        yPos += 20;
      });

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
      console.error('❌ Error generando PDF de estudiantes:', error);
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
        layout: 'landscape', // Orientación horizontal para más espacio
        margin: 40,
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
        doc.image(logoBuffer, (doc.page.width - 100) / 2, 40, { width: 100 });
      }

      doc.moveDown(6);

      doc.fontSize(20)
         .fillColor(colors.dark)
         .font('Helvetica-Bold')
         .text('ESCUELA DE BELLEZA JESSICA VÉLEZ', { align: 'center' });

      doc.moveDown(0.5);

      doc.fontSize(16)
         .fillColor(colors.primary)
         .text('REPORTE FINANCIERO', { align: 'center' });

      doc.moveDown(0.3);

      doc.fontSize(10)
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
      // Anchos optimizados para orientación horizontal (landscape)
      const colWidths = {
        cedula: 95,
        nombre: 160,
        curso: 130,
        monto: 70,
        fecha: 90,
        metodo: 110,
        estado: 90
      };

      let xPos = 40;

      // Header con mejor diseño
      doc.rect(30, tableTop, doc.page.width - 60, 28)
         .fillAndStroke(colors.primary, colors.primary);

      doc.fontSize(10)
         .fillColor('#000000')
         .font('Helvetica-Bold');

      xPos = 30;
      doc.text('IDENTIFICACIÓN', xPos + 5, tableTop + 9, { width: colWidths.cedula, align: 'left' });
      xPos += colWidths.cedula;
      doc.text('NOMBRE', xPos + 5, tableTop + 9, { width: colWidths.nombre, align: 'left' });
      xPos += colWidths.nombre;
      doc.text('CURSO', xPos + 5, tableTop + 9, { width: colWidths.curso, align: 'left' });
      xPos += colWidths.curso;
      doc.text('MONTO', xPos + 5, tableTop + 9, { width: colWidths.monto, align: 'right' });
      xPos += colWidths.monto;
      doc.text('FECHA', xPos + 5, tableTop + 9, { width: colWidths.fecha, align: 'center' });
      xPos += colWidths.fecha;
      doc.text('MÉTODO', xPos + 5, tableTop + 9, { width: colWidths.metodo, align: 'left' });
      xPos += colWidths.metodo;
      doc.text('ESTADO', xPos + 5, tableTop + 9, { width: colWidths.estado, align: 'center' });

      let yPos = tableTop + 33;

      // Filas con mejor espaciado
      datos.forEach((pago, index) => {
        if (yPos > doc.page.height - 100) {
          doc.addPage();
          yPos = 50;
        }

        // Fondo alternado para mejor legibilidad (altura aumentada para 2 líneas)
        if (index % 2 === 0) {
          doc.rect(30, yPos - 6, doc.page.width - 60, 32)
             .fillColor('#f5f5f5')
             .fill();
        }

        xPos = 30;

        doc.fontSize(9)
           .fillColor(colors.text)
           .font('Helvetica');

        // Cédula
        doc.text(pago.cedula_estudiante || 'N/A', xPos + 5, yPos + 6, { width: colWidths.cedula, align: 'left' });
        xPos += colWidths.cedula;

        // Nombre en dos líneas (nombre arriba, apellido abajo)
        doc.fontSize(8)
           .font('Helvetica-Bold')
           .text(pago.nombre_estudiante || 'N/A', xPos + 5, yPos + 2, { width: colWidths.nombre, align: 'left' });
        doc.fontSize(8)
           .font('Helvetica')
           .text(pago.apellido_estudiante || '', xPos + 5, yPos + 12, { width: colWidths.nombre, align: 'left' });
        xPos += colWidths.nombre;

        // Curso (centrado verticalmente)
        doc.fontSize(9)
           .fillColor(colors.text)
           .font('Helvetica');
        const cursoNombre = pago.nombre_curso || 'N/A';
        const cursoCorto = cursoNombre.length > 18 ? cursoNombre.substring(0, 15) + '...' : cursoNombre;
        doc.text(cursoCorto, xPos + 5, yPos + 6, { width: colWidths.curso, align: 'left' });
        xPos += colWidths.curso;

        // Monto (alineado a la derecha, centrado verticalmente)
        doc.text(formatearMoneda(pago.monto), xPos + 5, yPos + 6, { width: colWidths.monto - 10, align: 'right' });
        xPos += colWidths.monto;

        // Fecha (centrado verticalmente)
        let fechaMostrar = 'N/A';
        if (pago.fecha_pago) {
          fechaMostrar = new Date(pago.fecha_pago).toLocaleDateString('es-ES');
        } else if (pago.fecha_vencimiento) {
          fechaMostrar = new Date(pago.fecha_vencimiento).toLocaleDateString('es-ES');
        }
        doc.text(fechaMostrar, xPos, yPos + 6, { width: colWidths.fecha, align: 'center' });
        xPos += colWidths.fecha;

        // Método (centrado verticalmente)
        const metodoPago = pago.metodo_pago ? pago.metodo_pago.toUpperCase() : 'PENDIENTE';
        doc.text(metodoPago, xPos + 5, yPos + 6, { width: colWidths.metodo, align: 'left' });
        xPos += colWidths.metodo;

        // Estado con color (centrado verticalmente)
        let estadoColor = colors.text;
        if (pago.estado_pago === 'verificado') estadoColor = colors.success;
        if (pago.estado_pago === 'pendiente') estadoColor = colors.error;

        doc.fillColor(estadoColor)
           .font('Helvetica-Bold')
           .text(pago.estado_pago.toUpperCase(), xPos, yPos + 6, { width: colWidths.estado, align: 'center' });

        yPos += 32;
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

      doc.end();
    } catch (error) {
      console.error('❌ Error generando PDF financiero:', error);
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
        margin: 40,
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
        doc.image(logoBuffer, (doc.page.width - 100) / 2, 40, { width: 100 });
      }

      doc.moveDown(6);

      doc.fontSize(20)
         .fillColor(colors.dark)
         .font('Helvetica-Bold')
         .text('ESCUELA DE BELLEZA JESSICA VÉLEZ', { align: 'center' });

      doc.moveDown(0.5);

      doc.fontSize(16)
         .fillColor(colors.primary)
         .text('REPORTE DE CURSOS', { align: 'center' });

      doc.moveDown(0.3);

      doc.fontSize(10)
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
        codigo: 60,
        nombre: 120,
        horario: 70,
        capacidad: 70,
        docente: 120,
        aula: 70
      };

      let xPos = 40;

      // Header de tabla con fondo
      doc.rect(40, tableTop, doc.page.width - 80, 25)
         .fillAndStroke(colors.primary, colors.primary);

      doc.fontSize(9)
         .fillColor(colors.dark)
         .font('Helvetica-Bold');

      doc.text('CÓDIGO', xPos + 5, tableTop + 8, { width: colWidths.codigo });
      xPos += colWidths.codigo;
      doc.text('NOMBRE CURSO', xPos + 5, tableTop + 8, { width: colWidths.nombre });
      xPos += colWidths.nombre;
      doc.text('HORARIO', xPos + 5, tableTop + 8, { width: colWidths.horario });
      xPos += colWidths.horario;
      doc.text('CAPACIDAD', xPos + 5, tableTop + 8, { width: colWidths.capacidad });
      xPos += colWidths.capacidad;
      doc.text('DOCENTE', xPos + 5, tableTop + 8, { width: colWidths.docente });
      xPos += colWidths.docente;
      doc.text('AULA', xPos + 5, tableTop + 8, { width: colWidths.aula });

      let yPos = tableTop + 30;

      // Filas de datos
      datos.forEach((curso, index) => {
        // Verificar si necesitamos nueva página
        if (yPos > doc.page.height - 100) {
          doc.addPage();
          yPos = 40;
        }

        // Fondo alternado
        if (index % 2 === 0) {
          doc.rect(40, yPos - 5, doc.page.width - 80, 20)
             .fillColor('#f9f9f9')
             .fill();
        }

        xPos = 40;

        doc.fontSize(8)
           .fillColor(colors.text)
           .font('Helvetica');

        // Código
        doc.text(curso.codigo_curso || 'N/A', xPos + 5, yPos, { width: colWidths.codigo });
        xPos += colWidths.codigo;

        // Nombre del curso
        doc.text(curso.nombre_curso, xPos + 5, yPos, { width: colWidths.nombre });
        xPos += colWidths.nombre;

        // Horario
        doc.text(curso.horario || 'N/A', xPos + 5, yPos, { width: colWidths.horario });
        xPos += colWidths.horario;

        // Capacidad
        const capacidad = `${curso.total_estudiantes}/${curso.capacidad_maxima}`;
        doc.text(capacidad, xPos + 5, yPos, { width: colWidths.capacidad });
        xPos += colWidths.capacidad;

        // Docente
        const docente = curso.docente_nombres ? `${curso.docente_nombres} ${curso.docente_apellidos || ''}` : 'N/A';
        doc.text(docente, xPos + 5, yPos, { width: colWidths.docente });
        xPos += colWidths.docente;

        // Aula
        doc.text(curso.aula_nombre || 'N/A', xPos + 5, yPos, { width: colWidths.aula });

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

      doc.end();
    } catch (error) {
      console.error('❌ Error generando PDF de cursos:', error);
      reject(error);
    }
  });
}

module.exports = {
  generarPDFEstudiantes,
  generarPDFFinanciero,
  generarPDFCursos
};
