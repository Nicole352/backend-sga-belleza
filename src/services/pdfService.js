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
 * Generar PDF de comprobante de pago mensual - DISEÑO PROFESIONAL MEJORADO
 */
async function generarComprobantePagoMensual(estudiante, pago, curso) {
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
        textGray: '#a1a1a1',     // Gris medio
        textLight: '#e5e5e5',    // Gris muy claro
        border: '#333333',       // Borde sutil
        accent: '#ef4444'        // Rojo acento
      };

      // ==================== HEADER COMPACTO Y ELEGANTE ====================
      // Fondo oscuro del header - Más pequeño
      doc.rect(0, 0, doc.page.width, 140)
         .fill(colors.darkest);
      
      // Logo compacto con marco dorado
      const logoBuffer = await descargarLogo();
      if (logoBuffer) {
        try {
          const logoSize = 60;
          const logoX = (doc.page.width / 2) - (logoSize / 2);
          const logoY = 20;
          
          // Marco dorado sutil
          doc.circle(doc.page.width / 2, logoY + (logoSize / 2), (logoSize / 2) + 3)
             .lineWidth(2)
             .stroke(colors.primary);
          
          doc.image(logoBuffer, logoX, logoY, { width: logoSize, height: logoSize });
        } catch (imgError) {
          console.error('❌ Error insertando logo en PDF:', imgError.message);
        }
      }

      // Título principal - Compacto y elegante
      doc.fontSize(26)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Comprobante de Pago', 0, 95, { 
           align: 'center',
           width: doc.page.width
         });

      // Subtítulo
      doc.fontSize(12)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Academia Jessica Vélez', 0, 122, { 
           align: 'center',
           width: doc.page.width
         });

      // Fondo negro puro para el cuerpo
      doc.rect(0, 145, doc.page.width, doc.page.height - 145)
         .fill(colors.dark);

      // ==================== INFORMACIÓN DEL COMPROBANTE ====================
      let yPosition = 160;
      const margin = 50;

      // Número y fecha en una línea - Compacto
      doc.fontSize(10)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Comprobante', margin, yPosition);
      
      doc.fontSize(16)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text(`#${String(pago.id_pago_mensual || 'N/A').padStart(6, '0')}`, margin, yPosition + 14);

      doc.fontSize(10)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Fecha', doc.page.width - margin - 110, yPosition);
      
      doc.fontSize(16)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text(new Date().toLocaleDateString('es-EC', { 
           day: '2-digit', 
           month: 'short', 
           year: 'numeric' 
         }), doc.page.width - margin - 110, yPosition + 14);

      yPosition += 50;

      // ==================== DATOS DEL ESTUDIANTE ====================
      // Línea divisoria
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition += 20;

      // Título de sección compacto
      doc.fontSize(16)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Datos del Estudiante', margin, yPosition);

      yPosition += 28;

      const datosEstudiante = [
        { label: 'Nombre Completo', value: `${estudiante.nombres} ${estudiante.apellidos}` },
        { label: 'Cédula/Pasaporte', value: estudiante.cedula || 'N/A' },
        { label: 'Email', value: estudiante.email },
        { label: 'Curso', value: curso.nombre_curso || 'N/A' }
      ];

      datosEstudiante.forEach((item, index) => {
        doc.fontSize(9)
           .fillColor(colors.textGray)
           .font('Helvetica')
           .text(item.label, margin, yPosition);
        
        doc.fontSize(12)
           .fillColor(colors.text)
           .font('Helvetica-Bold')
           .text(item.value, margin, yPosition + 12, { width: doc.page.width - (margin * 2) });
        
        yPosition += 32;
      });

      yPosition += 10;

      // ==================== DETALLES DEL PAGO ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition += 20;

      doc.fontSize(16)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Detalles del Pago', margin, yPosition);

      yPosition += 28;

      const detallesPago = [
        { label: 'Mes Pagado', value: new Date(pago.mes_pago).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }).toUpperCase() },
        { label: 'Fecha de Pago', value: new Date(pago.fecha_pago).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }) },
        { label: 'Método de Pago', value: pago.metodo_pago.toUpperCase() },
        { label: 'Estado', value: '✓ APROBADO', color: colors.success }
      ];

      detallesPago.forEach(item => {
        doc.fontSize(9)
           .fillColor(colors.textGray)
           .font('Helvetica')
           .text(item.label, margin, yPosition);
        
        doc.fontSize(12)
           .fillColor(item.color || colors.text)
           .font('Helvetica-Bold')
           .text(item.value, margin, yPosition + 12);
        
        yPosition += 32;
      });

      yPosition += 15;

      // ==================== MONTO TOTAL DESTACADO ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.primary)
         .lineWidth(2)
         .stroke();

      yPosition += 25;

      doc.fontSize(12)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Monto Total Pagado', 0, yPosition, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(36)
         .fillColor(colors.primary)
         .font('Helvetica-Bold')
         .text(`$${parseFloat(pago.monto).toFixed(2)}`, 0, yPosition + 18, { 
           align: 'center',
           width: doc.page.width
         });

      yPosition += 70;

      // ==================== RECORDATORIO COMPACTO ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition += 18;

      doc.fontSize(11)
         .fillColor(colors.textGray)
         .font('Helvetica-Bold')
         .text('Información Importante', margin, yPosition);

      yPosition += 18;

      doc.fontSize(9)
         .fillColor(colors.textLight)
         .font('Helvetica')
         .text(
           '• Sé puntual con tus pagos mensuales  • La academia NO cobra matrícula  • Conserva este comprobante',
           margin,
           yPosition,
           { width: doc.page.width - (margin * 2), lineGap: 4 }
         );

      // ==================== FOOTER COMPACTO ====================
      const footerY = doc.page.height - 70;

      doc.moveTo(margin, footerY)
         .lineTo(doc.page.width - margin, footerY)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition = footerY + 15;

      doc.fontSize(11)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Academia Jessica Vélez', 0, yPosition, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(9)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Escuela de Belleza Estética', 0, yPosition + 16, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(8)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text(
           `Generado el ${new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}`,
           0,
           yPosition + 32,
           { align: 'center', width: doc.page.width }
         );

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
        textGray: '#a1a1a1',     // Gris medio
        textLight: '#e5e5e5',    // Gris muy claro
        border: '#333333'        // Borde sutil
      };

      // ==================== HEADER COMPACTO CON VERDE ====================
      doc.rect(0, 0, doc.page.width, 140)
         .fill(colors.success);
      
      // Logo compacto
      const logoBuffer = await descargarLogo();
      if (logoBuffer) {
        try {
          const logoSize = 60;
          const logoX = (doc.page.width / 2) - (logoSize / 2);
          const logoY = 20;
          
          doc.circle(doc.page.width / 2, logoY + (logoSize / 2), (logoSize / 2) + 3)
             .lineWidth(2)
             .stroke(colors.primary);
          
          doc.image(logoBuffer, logoX, logoY, { width: logoSize, height: logoSize });
        } catch (imgError) {
          console.error('❌ Error insertando logo en PDF:', imgError.message);
        }
      }

      doc.fontSize(26)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Matrícula Aprobada', 0, 95, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(12)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Academia Jessica Vélez', 0, 122, { 
           align: 'center',
           width: doc.page.width
         });

      doc.rect(0, 145, doc.page.width, doc.page.height - 145)
         .fill(colors.dark);

      // ==================== MENSAJE DE FELICITACIÓN ====================
      let yPosition = 160;
      const margin = 50;

      doc.fontSize(20)
         .fillColor(colors.success)
         .font('Helvetica-Bold')
         .text('✓ ¡Felicitaciones!', 0, yPosition, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(11)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Tu matrícula ha sido aprobada exitosamente', 0, yPosition + 26, { 
           align: 'center',
           width: doc.page.width
         });

      yPosition += 55;

      // ==================== DATOS DEL ESTUDIANTE ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition += 20;

      doc.fontSize(16)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Datos del Estudiante', margin, yPosition);

      yPosition += 28;

      const datosEstudiante = [
        { label: 'Nombre Completo', value: `${estudiante.nombres} ${estudiante.apellidos}` },
        { label: 'Cédula/Pasaporte', value: estudiante.cedula || 'N/A' },
        { label: 'Email', value: estudiante.email },
        { label: 'Teléfono', value: solicitud.telefono || 'N/A' },
        { label: 'Curso', value: curso.nombre_curso || 'N/A' },
        { label: 'Horario', value: (solicitud.horario_preferido || 'N/A').toUpperCase() }
      ];

      datosEstudiante.forEach(item => {
        doc.fontSize(9)
           .fillColor(colors.textGray)
           .font('Helvetica')
           .text(item.label, margin, yPosition);
        
        doc.fontSize(12)
           .fillColor(colors.text)
           .font('Helvetica-Bold')
           .text(item.value, margin, yPosition + 12, { width: doc.page.width - (margin * 2) });
        
        yPosition += 32;
      });

      yPosition += 10;

      // ==================== INFORMACIÓN DE PAGO ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.primary)
         .lineWidth(2)
         .stroke();

      yPosition += 25;

      doc.fontSize(12)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Primer Mes Pagado', 0, yPosition, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(36)
         .fillColor(colors.primary)
         .font('Helvetica-Bold')
         .text(`$${parseFloat(solicitud.monto_matricula).toFixed(2)}`, 0, yPosition + 18, { 
           align: 'center',
           width: doc.page.width
         });

      yPosition += 70;

      // ==================== RECORDATORIO COMPACTO ====================
      doc.moveTo(margin, yPosition)
         .lineTo(doc.page.width - margin, yPosition)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition += 18;

      doc.fontSize(11)
         .fillColor(colors.textGray)
         .font('Helvetica-Bold')
         .text('Información Importante', margin, yPosition);

      yPosition += 18;

      doc.fontSize(9)
         .fillColor(colors.textLight)
         .font('Helvetica')
         .text(
           '• La academia NO cobra matrícula  • Sé puntual con tus pagos  • Recibirás comprobantes PDF',
           margin,
           yPosition,
           { width: doc.page.width - (margin * 2), lineGap: 4 }
         );

      // ==================== FOOTER COMPACTO ====================
      const footerY = doc.page.height - 70;

      doc.moveTo(margin, footerY)
         .lineTo(doc.page.width - margin, footerY)
         .strokeColor(colors.border)
         .lineWidth(1)
         .stroke();

      yPosition = footerY + 15;

      doc.fontSize(11)
         .fillColor(colors.text)
         .font('Helvetica-Bold')
         .text('Academia Jessica Vélez', 0, yPosition, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(9)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text('Escuela de Belleza Estética', 0, yPosition + 16, { 
           align: 'center',
           width: doc.page.width
         });

      doc.fontSize(8)
         .fillColor(colors.textGray)
         .font('Helvetica')
         .text(
           `Generado el ${new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}`,
           0,
           yPosition + 32,
           { align: 'center', width: doc.page.width }
         );

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
