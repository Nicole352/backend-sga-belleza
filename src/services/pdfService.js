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
 * Generar PDF de comprobante de pago mensual - DISEÑO PROFESIONAL MEJORADO
 */
async function generarComprobantePagoMensual(estudiante, pago, curso, clasesPagadas = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 0,
        bufferPages: true
      });
      const chunks = [];

      // Capturar el PDF en memoria
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Paleta de colores estilo Vercel - Minimalista y elegante
      const colors = {
        primary: '#fbbf24',      // Dorado elegante
        primaryDark: '#f59e0b',  // Dorado oscuro
        dark: '#000000',         // Negro puro (Vercel style)
        darker: '#0a0a0a',       // Negro suave
        darkest: '#050505',      // Negro profundo
        success: '#10b981',      // Verde éxito
        text: '#ffffff',         // Texto blanco puro
        textGray: '#9ca3af',     // Gris medio consistente
        textLight: '#d1d5db',    // Gris claro consistente
        border: '#374151',       // Borde gris oscuro
        accent: '#ef4444'        // Rojo acento
      };

      // ==================== HEADER MÁS COMPACTO ====================
      // Fondo oscuro del header - Reducido
      doc.rect(0, 0, doc.page.width, 75)
         .fill(colors.darkest);
      
      // Logo más pequeño con marco dorado
      const logoBuffer = await descargarLogo();
      if (logoBuffer) {
        try {
          const logoSize = 35;
          const logoX = (doc.page.width / 2) - (logoSize / 2);
          const logoY = 10;
          
          // Marco dorado sutil
          doc.circle(doc.page.width / 2, logoY + (logoSize / 2), (logoSize / 2) + 1.5)
             .lineWidth(1)
             .stroke(colors.primary);
          
          doc.image(logoBuffer, logoX, logoY, { width: logoSize, height: logoSize });
        } catch (imgError) {
          console.error('Error insertando logo en PDF:', imgError.message);
        }
      }

      // Título principal - Más pequeño
      doc.fontSize(14)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Comprobante de Pago', 0, 52, { 
           align: 'center',
           width: doc.page.width
         });

      // Subtítulo
      doc.fontSize(8)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Escuela Jessica Vélez', 0, 66, { 
           align: 'center',
           width: doc.page.width
         });

      // Fondo negro puro para el cuerpo
      doc.rect(0, 80, doc.page.width, doc.page.height - 80)
         .fill(colors.dark);

      // ==================== INFORMACIÓN DEL COMPROBANTE ====================
      let yPosition = 95;
      const margin = 50;

      // Número y fecha en una línea - Compacto
      doc.fontSize(8)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Comprobante', margin, yPosition);
      
      doc.fontSize(14)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text(`#${String(pago.id_pago_mensual || 'N/A').padStart(6, '0')}`, margin, yPosition + 12);

      doc.fontSize(8)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Fecha', doc.page.width - margin - 110, yPosition);
      
      doc.fontSize(14)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text(new Date().toLocaleDateString('es-EC', { 
           day: '2-digit', 
           month: 'short', 
           year: 'numeric' 
         }), doc.page.width - margin - 110, yPosition + 12);

      yPosition += 40;

      // ==================== DATOS DEL ESTUDIANTE ====================
      // Línea divisoria
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition += 15;

      // Título de sección compacto
      doc.fontSize(12)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Datos del Estudiante', margin, yPosition);

      yPosition += 22;

      const datosEstudiante = [
        { label: 'Nombre Completo', value: `${estudiante.nombres} ${estudiante.apellidos}` },
        { label: 'Cédula/Pasaporte', value: estudiante.cedula || 'N/A' },
        { label: 'Email', value: estudiante.email },
        { label: 'Curso', value: curso.nombre_curso || 'N/A' }
      ];

      datosEstudiante.forEach((item, index) => {
        doc.fontSize(8)
           .fillColor(colors.textGray)
           .font('Helvetica')
           .text(item.label, margin, yPosition);
        
        doc.fontSize(10)
           .fillColor(colors.text)
           .font('Helvetica-Bold')
           .text(item.value, margin, yPosition + 10, { width: doc.page.width - (margin * 2) });
        
        yPosition += 24;
      });

      yPosition += 8;

      // ==================== DETALLES DEL PAGO ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition += 15;

      doc.fontSize(12)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Detalles del Pago', margin, yPosition);

      yPosition += 22;

      // Detalles del pago según modalidad
      let detallesPago;
      
      if (pago.modalidad_pago === 'clases') {
        // Para cursos por clases
        detallesPago = [
          { label: 'Clase Pagada', value: `CLASE ${pago.numero_cuota}` },
          { label: 'Fecha de Pago', value: new Date(pago.fecha_pago).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }) },
          { label: 'Método de Pago', value: pago.metodo_pago.toUpperCase() },
          { label: 'Estado', value: 'APROBADO', color: colors.success }
        ];
      } else {
        // Para cursos mensuales
        detallesPago = [
          { label: 'Mes Pagado', value: new Date(pago.mes_pago).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }).toUpperCase() },
          { label: 'Fecha de Pago', value: new Date(pago.fecha_pago).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }) },
          { label: 'Método de Pago', value: pago.metodo_pago.toUpperCase() },
          { label: 'Estado', value: 'APROBADO', color: colors.success }
        ];
      }

      detallesPago.forEach(item => {
        doc.fontSize(8)
           .fillColor(colors.textGray)
           .font('Helvetica')
           .text(item.label, margin, yPosition);
        
        doc.fontSize(10)
           .fillColor(item.color || colors.text)
           .font('Helvetica-Bold')
           .text(item.value, margin, yPosition + 10);
        
        yPosition += 24;
      });

      yPosition += 12;

      // ==================== PROGRESO DE CLASES (solo para cursos por clases) ====================
      if (clasesPagadas && clasesPagadas.length > 0) {
        doc.moveTo(margin, yPosition)
           .lineTo(doc.page.width - margin, yPosition)
           .strokeColor(colors.border)
           .lineWidth(1)
           .stroke();

        yPosition += 15;

        doc.fontSize(12)
           .fillColor(colors.text)
           .font('Helvetica-Bold')
           .text('Progreso de Clases', margin, yPosition);

        yPosition += 22;

        clasesPagadas.forEach((clase, index) => {
          // Icono de check y texto de clase
          doc.fontSize(9)
             .fillColor(colors.success)
             .font('Helvetica-Bold')
             .text('✅', margin, yPosition);
          
          doc.fontSize(9)
             .fillColor(colors.text)
             .font('Helvetica-Bold')
             .text(`Clase ${clase.numero}: Pagada`, margin + 20, yPosition);
          
          doc.fontSize(9)
             .fillColor(colors.primary)
             .font('Helvetica-Bold')
             .text(`$${clase.monto.toFixed(2)}`, doc.page.width - margin - 80, yPosition);
          
          yPosition += 18;
        });

        yPosition += 8;
      }

      // ==================== MONTO TOTAL DESTACADO ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.primary)
         .lineWidth(2)
         .stroke();

      yPosition += 20;

      doc.fontSize(10)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Monto Total Pagado', 0, yPosition, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(24)
         .fillColor(colors.primary)
         .font('Helvetica-Bold')
         .text(`$${parseFloat(pago.monto).toFixed(2)}`, 0, yPosition + 14, { 
           align: 'center',
           width: doc.page.width
         });

      yPosition += 50;

      // ==================== RECORDATORIO COMPACTO ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition += 14;

      doc.fontSize(10)
         .fillColor(colors.textGray)
         .font('Helvetica-Bold')
         .text('Información Importante', margin, yPosition);

      yPosition += 16;

      doc.fontSize(8)
         .fillColor(colors.textLight)
         .font('Helvetica')
         .text(
           '• Sé puntual con tus pagos mensuales  • La Escuela NO cobra matrícula  • Conserva este comprobante',
           margin,
           yPosition,
           { width: doc.page.width - (margin * 2), lineGap: 3 }
         );

      // ==================== FOOTER (igual al Excel) ====================
      const footerY = doc.page.height - 50;

      doc.moveTo(margin, footerY)
         .lineTo(doc.page.width - margin, footerY)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition = footerY + 12;

      // Footer en una sola línea como el Excel
      const fechaDescarga = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
      const footerText = `Escuela de Belleza Jessica Vélez     |     Descargado: ${fechaDescarga}`;

      doc.fontSize(8)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text(footerText, 0, yPosition, { 
           align: 'center',
           width: doc.page.width
         });

      // Finalizar el documento
      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generar PDF de comprobante de matrícula aprobada - DISEÑO PROFESIONAL MEJORADO
 */
async function generarComprobanteMatricula(estudiante, solicitud, curso) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 0,
        bufferPages: true
      });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Paleta de colores estilo Vercel - Minimalista (verde para matrícula)
      const colors = {
        primary: '#fbbf24',      // Dorado elegante
        primaryDark: '#f59e0b',  // Dorado oscuro
        dark: '#000000',         // Negro puro (Vercel style)
        darker: '#0a0a0a',       // Negro suave
        darkest: '#050505',      // Negro profundo
        success: '#10b981',      // Verde éxito
        text: '#ffffff',         // Texto blanco puro
        textGray: '#9ca3af',     // Gris medio consistente
        textLight: '#d1d5db',    // Gris claro consistente
        border: '#374151'        // Borde gris oscuro
      };

      // ==================== HEADER MÁS COMPACTO CON VERDE ====================
      doc.rect(0, 0, doc.page.width, 75)
         .fill(colors.success);
      
      // Logo más pequeño
      const logoBuffer = await descargarLogo();
      if (logoBuffer) {
        try {
          const logoSize = 35;
          const logoX = (doc.page.width / 2) - (logoSize / 2);
          const logoY = 10;
          
          doc.circle(doc.page.width / 2, logoY + (logoSize / 2), (logoSize / 2) + 1.5)
             .lineWidth(1)
             .stroke(colors.primary);
          
          doc.image(logoBuffer, logoX, logoY, { width: logoSize, height: logoSize });
        } catch (imgError) {
          console.error('Error insertando logo en PDF:', imgError.message);
        }
      }

      doc.fontSize(14)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Matrícula Aprobada', 0, 52, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(8)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Escuela Jessica Vélez', 0, 66, { 
           align: 'center',
           width: doc.page.width
         });

      doc.rect(0, 80, doc.page.width, doc.page.height - 80)
         .fill(colors.dark);

      // ==================== MENSAJE DE FELICITACIÓN ====================
      let yPosition = 95;
      const margin = 50;

      doc.fontSize(16)
         .fillColor(colors.success)
         .font('Helvetica-Bold')
         .text('✓ ¡Felicitaciones!', 0, yPosition, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(9)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Tu matrícula ha sido aprobada exitosamente', 0, yPosition + 22, { 
           align: 'center',
           width: doc.page.width
         });

      yPosition += 45;

      // ==================== DATOS DEL ESTUDIANTE ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition += 15;

      doc.fontSize(12)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Datos del Estudiante', margin, yPosition);

      yPosition += 22;

      const datosEstudiante = [
        { label: 'Nombre Completo', value: `${estudiante.nombres} ${estudiante.apellidos}` },
        { label: 'Cédula/Pasaporte', value: estudiante.cedula || 'N/A' },
        { label: 'Email', value: estudiante.email },
        { label: 'Teléfono', value: solicitud.telefono || 'N/A' },
        { label: 'Curso', value: curso.nombre_curso || 'N/A' },
        { label: 'Horario', value: (solicitud.horario_preferido || 'N/A').toUpperCase() }
      ];

      datosEstudiante.forEach(item => {
        doc.fontSize(8)
           .fillColor(colors.textGray)
           .font('Helvetica')
           .text(item.label, margin, yPosition);
        
        doc.fontSize(10)
           .fillColor(colors.text)
           .font('Helvetica-Bold')
           .text(item.value, margin, yPosition + 10, { width: doc.page.width - (margin * 2) });
        
        yPosition += 24;
      });

      yPosition += 8;

      // ==================== INFORMACIÓN DE PAGO ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.primary)
         .lineWidth(2)
         .stroke();

      yPosition += 20;

      doc.fontSize(10)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Primer Mes Pagado', 0, yPosition, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(24)
         .fillColor(colors.primary)
         .font('Helvetica-Bold')
         .text(`$${parseFloat(solicitud.monto_matricula).toFixed(2)}`, 0, yPosition + 14, { 
           align: 'center',
           width: doc.page.width
         });

      yPosition += 50;

      // ==================== RECORDATORIO COMPACTO ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition += 14;

      doc.fontSize(10)
         .fillColor(colors.textGray)
         .font('Helvetica-Bold')
         .text('Información Importante', margin, yPosition);

      yPosition += 16;

      doc.fontSize(8)
         .fillColor(colors.textLight)
         .font('Helvetica')
         .text(
           '• La Escuela NO cobra matrícula  • Sé puntual con tus pagos  • Recibirás comprobantes PDF',
           margin,
           yPosition,
           { width: doc.page.width - (margin * 2), lineGap: 3 }
         );

      // ==================== FOOTER (igual al Excel) ====================
      const footerY = doc.page.height - 50;

      doc.moveTo(margin, footerY)
         .lineTo(doc.page.width - margin, footerY)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition = footerY + 12;

      // Footer en una sola línea como el Excel
      const fechaDescarga = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
      const footerText = `Escuela de Belleza Jessica Vélez     |     Descargado: ${fechaDescarga}`;

      doc.fontSize(8)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text(footerText, 0, yPosition, { 
           align: 'center',
           width: doc.page.width
         });

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generarComprobantePagoMensual,
  generarComprobanteMatricula
};
