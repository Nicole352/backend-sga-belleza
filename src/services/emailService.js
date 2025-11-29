const nodemailer = require('nodemailer');
const { getActiveAdmins } = require('../models/admins.model');

// Configuración del transporter de nodemailer para iCloud Mail
// Con configuraciones anti-spam optimizadas
const transporter = nodemailer.createTransport({
  host: 'smtp.mail.me.com',
  port: 587,
  secure: false, // true para 465, false para otros puertos
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
    type: 'login'
  },
  tls: {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  },
  debug: true, // Habilitar logs para diagnóstico
  // Configuraciones adicionales para evitar spam y el texto "MAIN DELIVERY SYSTEM"
  pool: true, // Usar pool de conexiones
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 1000, // Tiempo entre emails (1 segundo)
  rateLimit: 5, // Máximo 5 emails por segundo
  headers: {
    'X-Transport-Type': 'Direct',
    'X-Mailer': 'Escuela Jessica Vélez - SGA',
    'X-MSMail-Priority': 'Normal',
    'X-MimeOLE': 'Produced By SGA System'
  }
});

/**
 * Enviar notificación al admin cuando hay una nueva solicitud de matrícula
 */
async function enviarNotificacionNuevaMatricula(solicitud) {
  try {
    // Obtener todos los administradores activos
    const admins = await getActiveAdmins();
    const adminEmails = admins.map(admin => admin.email);

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Escuela Jessica Vélez'}" <${process.env.EMAIL_USER}>`,
      to: adminEmails.join(', '), // Enviar a todos los admins activos
      replyTo: process.env.EMAIL_USER,
      subject: `🎓 Nueva Solicitud de Matrícula - ${solicitud.nombres} ${solicitud.apellidos}`,
      // Headers anti-spam
      headers: {
        'X-Priority': '1', // Alta prioridad
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'Escuela Jessica Vélez - Sistema de Gestión Académica',
        'X-Entity-Ref-ID': `matricula-${Date.now()}`,
        'List-Unsubscribe': `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
        'Precedence': 'bulk'
      },
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center; color: white; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
            .content { padding: 30px; }
            .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
            .info-item { background: #f9fafb; padding: 12px; border-radius: 8px; }
            .info-label { font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
            .info-value { font-size: 14px; color: #1f2937; font-weight: 600; }
            .button { display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; text-align: center; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
            .steps { background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .steps ol { margin: 10px 0; padding-left: 20px; }
            .steps li { margin: 8px 0; color: #1e40af; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 Nueva Solicitud de Matrícula</h1>
            </div>
            <div class="content">
              <div class="alert">
                <strong>⚠️ Acción Requerida:</strong> Tienes una nueva solicitud de matrícula pendiente de revisión.
              </div>
              
              <h2 style="color: #1f2937; margin-top: 25px;">📋 Información del Solicitante</h2>
              <div class="info-grid">
                <div class="info-item">
                  <div class="info-label">Código Solicitud</div>
                  <div class="info-value">${solicitud.codigo_solicitud}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Nombre Completo</div>
                  <div class="info-value">${solicitud.nombres} ${solicitud.apellidos}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Email</div>
                  <div class="info-value">${solicitud.email}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Teléfono</div>
                  <div class="info-value">${solicitud.telefono}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Curso</div>
                  <div class="info-value">${solicitud.nombre_curso}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Método de Pago</div>
                  <div class="info-value">${solicitud.metodo_pago}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Monto</div>
                  <div class="info-value">$${solicitud.monto_matricula}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Fecha Solicitud</div>
                  <div class="info-value">${new Date(solicitud.fecha_solicitud).toLocaleDateString('es-EC')}</div>
                </div>
              </div>

              <div class="steps">
                <strong style="color: #1e40af;">📝 Próximos Pasos:</strong>
                <ol>
                  <li>Revisa los documentos adjuntos (comprobante, identificación)</li>
                  <li>Verifica la información del estudiante</li>
                  <li>Aprueba o rechaza la solicitud desde el panel administrativo</li>
                  <li>El estudiante recibirá un email automático con sus credenciales</li>
                </ol>
              </div>

              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/panel/administrativo" class="button">
                  🔗 Ir a Gestión de Matrículas
                </a>
              </div>
            </div>
            <div class="footer">
              <p><strong>Escuela Jessica Vélez</strong></p>
              <p>Sistema de Gestión Académica - Notificación Automática</p>
              <p style="margin-top: 10px; color: #9ca3af;">Este es un correo automático, por favor no responder.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email de notificación enviado al admin:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error enviando email de notificación:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar email de bienvenida al estudiante cuando su matrícula es aprobada
 * @param {Object} estudiante - Datos del estudiante
 * @param {Object} credenciales - Credenciales de acceso (username, password)
 * @param {Buffer} pdfComprobante - PDF del comprobante del primer pago (opcional)
 */
async function enviarEmailBienvenidaEstudiante(estudiante, credenciales, pdfComprobante = null) {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Escuela Jessica Vélez'}" <${process.env.EMAIL_USER}>`,
      to: estudiante.email,
      replyTo: process.env.EMAIL_USER,
      subject: '🎉 ¡Bienvenido a Escuela Jessica Vélez! - Matrícula Aprobada',
      // Headers anti-spam para emails transaccionales
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'Escuela Jessica Vélez - Sistema de Gestión Académica',
        'X-Entity-Ref-ID': `bienvenida-${estudiante.cedula}-${Date.now()}`,
        'List-Unsubscribe': `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
        'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN, AutoReply',
        'Content-Language': 'es-ES'
      },
      attachments: pdfComprobante ? [
        {
          filename: `Comprobante_Primer_Pago_${estudiante.nombres}_${estudiante.apellidos}.pdf`,
          content: pdfComprobante,
          contentType: 'application/pdf'
        }
      ] : [],
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <style>
            /* Reset básico */
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              background-color: #f4f4f4; 
              margin: 0; 
              padding: 0;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
            }
            
            /* Contenedor principal - Responsive */
            .container { 
              max-width: 600px; 
              margin: 40px auto; 
              background: white; 
              border-radius: 12px; 
              overflow: hidden; 
              box-shadow: 0 4px 20px rgba(0,0,0,0.1); 
            }
            
            /* Header con gradiente */
            .header { 
              background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
              padding: 40px 20px; 
              text-align: center; 
              color: white; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 28px; 
              font-weight: 700; 
              line-height: 1.3;
            }
            .header p { 
              margin: 10px 0 0 0; 
              font-size: 16px; 
              opacity: 0.95; 
            }
            
            /* Logo circular */
            .logo { 
              width: 80px; 
              height: 80px; 
              margin: 0 auto 15px;
              background: rgba(255,255,255,0.2);
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 40px;
            }
            
            /* Contenido principal */
            .content { 
              padding: 30px 20px; 
            }
            
            /* Caja de éxito */
            .success-box { 
              background: #d1fae5; 
              border: 2px solid #10b981; 
              padding: 20px; 
              border-radius: 12px; 
              text-align: center; 
              margin: 20px 0; 
            }
            .success-box h2 { 
              color: #065f46; 
              margin: 0 0 10px 0; 
              font-size: 20px; 
            }
            .success-box p {
              color: #065f46;
              margin: 10px 0 0 0;
              font-size: 15px;
              line-height: 1.6;
            }
            
            /* Credenciales destacadas */
            .credentials { 
              background: #eff6ff; 
              border: 2px solid #3b82f6; 
              padding: 25px 20px; 
              border-radius: 12px; 
              margin: 25px 0; 
            }
            .credentials h3 { 
              color: #1e40af; 
              margin: 0 0 20px 0; 
              text-align: center; 
              font-size: 18px; 
            }
            .credential-item { 
              background: white; 
              padding: 15px; 
              border-radius: 8px; 
              margin: 12px 0; 
              border-left: 4px solid #3b82f6; 
            }
            .credential-label { 
              font-size: 12px; 
              color: #6b7280; 
              font-weight: 600; 
              text-transform: uppercase; 
              margin-bottom: 6px; 
            }
            .credential-value { 
              font-size: 18px; 
              color: #1f2937; 
              font-weight: 700; 
              font-family: 'Courier New', monospace; 
              letter-spacing: 1px;
              word-break: break-all;
            }
            
            /* Alerta de advertencia */
            .warning { 
              background: #fef3c7; 
              border-left: 4px solid #f59e0b; 
              padding: 15px; 
              margin: 20px 0; 
              border-radius: 4px;
              line-height: 1.6;
            }
            
            /* Botón de acción */
            .button { 
              display: inline-block; 
              background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
              color: white !important; 
              padding: 16px 40px; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: 600; 
              margin: 20px 0; 
              text-align: center; 
              font-size: 16px;
              transition: transform 0.2s ease;
            }
            .button:hover {
              transform: scale(1.05);
            }
            
            /* Secciones informativas */
            .info-section { 
              background: #f9fafb; 
              padding: 20px; 
              border-radius: 8px; 
              margin: 20px 0; 
            }
            .info-section h4 { 
              color: #374151; 
              margin: 0 0 15px 0; 
              font-size: 16px; 
            }
            .info-section ul { 
              margin: 0; 
              padding-left: 20px; 
            }
            .info-section li { 
              margin: 8px 0; 
              color: #4b5563; 
              line-height: 1.6; 
            }
            
            /* Footer */
            .footer { 
              background: #f9fafb; 
              padding: 25px 20px; 
              text-align: center; 
              font-size: 12px; 
              color: #6b7280;
              line-height: 1.6;
            }
            
            /* RESPONSIVE - TABLET (768px - 1024px) */
            @media only screen and (min-width: 768px) and (max-width: 1024px) {
              .container {
                max-width: 90%;
                margin: 30px auto;
              }
              .header h1 {
                font-size: 32px;
              }
              .credential-value {
                font-size: 20px;
              }
              .button {
                padding: 18px 50px;
                font-size: 18px;
              }
            }
            
            /* RESPONSIVE - DESKTOP (1025px+) */
            @media only screen and (min-width: 1025px) {
              .container {
                max-width: 700px;
                margin: 50px auto;
              }
              .header {
                padding: 50px 30px;
              }
              .header h1 {
                font-size: 36px;
              }
              .content {
                padding: 40px 30px;
              }
              .credentials {
                padding: 30px;
              }
              .credential-value {
                font-size: 22px;
              }
              .button {
                padding: 18px 60px;
                font-size: 18px;
              }
              .logo {
                width: 100px;
                height: 100px;
                font-size: 50px;
              }
            }
            
            /* RESPONSIVE - MÓVIL (max 767px) */
            @media only screen and (max-width: 767px) {
              .container {
                margin: 10px;
                border-radius: 8px;
              }
              .header {
                padding: 30px 15px;
              }
              .header h1 {
                font-size: 22px;
              }
              .header p {
                font-size: 14px;
              }
              .content {
                padding: 20px 15px;
              }
              .success-box {
                padding: 15px;
              }
              .success-box h2 {
                font-size: 18px;
              }
              .credentials {
                padding: 20px 15px;
              }
              .credentials h3 {
                font-size: 16px;
              }
              .credential-item {
                padding: 12px;
              }
              .credential-value {
                font-size: 16px;
                letter-spacing: 0.5px;
              }
              .button {
                display: block;
                width: 100%;
                padding: 14px 20px;
                font-size: 15px;
              }
              .info-section {
                padding: 15px;
              }
              .info-section h4 {
                font-size: 15px;
              }
              .info-section li {
                font-size: 14px;
              }
              .logo {
                width: 60px;
                height: 60px;
                font-size: 30px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo" style="background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 40px;">
                🎓
              </div>
              <h1>¡Bienvenido a Escuela Jessica Vélez!</h1>
              <p>Tu matrícula ha sido aprobada exitosamente</p>
            </div>
            
            <div class="content">
              <div class="success-box">
                <h2>✅ ¡Felicitaciones ${estudiante.nombres}!</h2>
                <p style="color: #065f46; margin: 10px 0 0 0; font-size: 15px;">
                  Tu solicitud de matrícula ha sido aprobada. Estamos emocionados de tenerte en nuestra Escuela.
                </p>
              </div>

              <p style="color: #4b5563; line-height: 1.8; font-size: 15px;">
                Gracias por elegir a <strong>Escuela Jessica Vélez</strong> para tu formación profesional en belleza estética. 
                Estamos comprometidos en brindarte la mejor educación y acompañarte en tu camino hacia el éxito.
              </p>

              <div class="credentials">
                <h3>🔐 Tus Credenciales de Acceso</h3>
                <p style="text-align: center; color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">
                  Usa estas credenciales para acceder a tu aula virtual
                </p>
                <div class="credential-item">
                  <div class="credential-label">👤 Usuario (Username)</div>
                  <div class="credential-value">${credenciales.username}</div>
                </div>
                <div class="credential-item">
                  <div class="credential-label">🔑 Contraseña Temporal</div>
                  <div class="credential-value">${credenciales.password}</div>
                </div>
              </div>

              <div class="warning">
                <strong>⚠️ Importante:</strong> Por seguridad, deberás cambiar tu contraseña en el primer inicio de sesión. 
                La contraseña temporal es tu número de identificación.
              </div>

              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/aula-virtual" class="button">
                  🚀 Acceder al Aula Virtual
                </a>
              </div>

              <div class="info-section">
                <h4>📚 Próximos Pasos:</h4>
                <ul>
                  <li><strong>Accede al aula virtual</strong> con tus credenciales</li>
                  <li><strong>Cambia tu contraseña</strong> por una segura y personal</li>
                  <li><strong>Completa tu perfil</strong> con tu información actualizada</li>
                  <li><strong>Revisa tu horario</strong> y los módulos del curso</li>
                  <li><strong>Recuerda ser puntual</strong> con tus pagos mensuales</li>
                </ul>
              </div>

              <div class="info-section" style="background: #fef2f2; border-left: 4px solid #ef4444;">
                <h4 style="color: #991b1b;">💰 Recordatorio de Pagos:</h4>
                <ul style="color: #991b1b;">
                  <li>La Escuela <strong>NO cobra matrícula</strong>, solo pagas el primer mes por adelantado</li>
                  <li><strong>Sé puntual</strong> con tus pagos mensuales para evitar inconvenientes</li>
                  <li>Puedes realizar tus pagos desde el <strong>panel de estudiante</strong></li>
                  <li>Recibirás un <strong>comprobante PDF</strong> por cada pago realizado</li>
                </ul>
              </div>

              ${pdfComprobante ? `
              <div class="info-section" style="background: #eff6ff; border-left: 4px solid #3b82f6;">
                <h4 style="color: #1e40af;">📎 Comprobante del Primer Pago Adjunto</h4>
                <p style="color: #1e40af; margin: 10px 0 0 0;">
                  Hemos adjuntado el <strong>comprobante de tu primer pago</strong> en formato PDF. 
                  Guárdalo para tus registros personales. 📄
                </p>
              </div>
              ` : ''}

              <p style="color: #4b5563; text-align: center; margin-top: 30px; font-size: 15px;">
                Si tienes alguna pregunta, no dudes en contactarnos. ¡Éxitos en tu formación! 🌟
              </p>
            </div>

            <div class="footer">
              <p><strong>Escuela Jessica Vélez</strong></p>
              <p>Tu carrera en belleza estética comienza aquí</p>
              <p style="margin-top: 15px; color: #9ca3af;">
                Este correo fue enviado a: ${estudiante.email}<br>
                Si no solicitaste esta matrícula, por favor contacta con nosotros inmediatamente.
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email de bienvenida enviado a:', estudiante.email);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error enviando email de bienvenida:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar email con comprobante de pago mensual
 */
async function enviarComprobantePagoMensual(estudiante, pago, pdfBuffer) {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Escuela Jessica Vélez'}" <${process.env.EMAIL_USER}>`,
      to: estudiante.email,
      replyTo: process.env.EMAIL_USER,
      subject: `📄 Comprobante de Pago - Mes ${new Date(pago.mes_pago).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' })}`,
      // Headers anti-spam
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'Escuela Jessica Vélez - Sistema de Gestión Académica',
        'X-Entity-Ref-ID': `comprobante-${pago.id_pago_mensual}-${Date.now()}`,
        'List-Unsubscribe': `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
        'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN, AutoReply',
        'Content-Language': 'es-ES'
      },
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; text-align: center; color: white; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
            .content { padding: 30px; }
            .success-box { background: #d1fae5; border: 2px solid #10b981; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
            .info-item { background: #f9fafb; padding: 12px; border-radius: 8px; }
            .info-label { font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
            .info-value { font-size: 14px; color: #1f2937; font-weight: 600; }
            .reminder { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📄 Comprobante de Pago</h1>
            </div>
            <div class="content">
              <div class="success-box">
                <h2 style="color: #065f46; margin: 0 0 10px 0;">✅ Pago Aprobado</h2>
                <p style="color: #065f46; margin: 0;">Tu pago ha sido procesado exitosamente</p>
              </div>

              <h3 style="color: #1f2937; margin-top: 25px;">📋 Detalles del Pago</h3>
              <div class="info-grid">
                <div class="info-item">
                  <div class="info-label">Estudiante</div>
                  <div class="info-value">${estudiante.nombres} ${estudiante.apellidos}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Mes Pagado</div>
                  <div class="info-value">${new Date(pago.mes_pago).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' })}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Monto</div>
                  <div class="info-value">$${pago.monto}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Fecha de Pago</div>
                  <div class="info-value">${new Date(pago.fecha_pago).toLocaleDateString('es-EC')}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Método de Pago</div>
                  <div class="info-value">${pago.metodo_pago}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Estado</div>
                  <div class="info-value" style="color: #10b981;">Aprobado</div>
                </div>
              </div>

              <div class="reminder">
                <strong>⏰ Recordatorio:</strong> Recuerda ser puntual con tus pagos mensuales para mantener tu matrícula activa 
                y continuar con tu formación sin interrupciones.
              </div>

              <p style="color: #4b5563; text-align: center; margin-top: 25px;">
                📎 Adjunto encontrarás tu <strong>comprobante de pago en PDF</strong> para tus registros.
              </p>
            </div>
            <div class="footer">
              <p><strong>Escuela Jessica Vélez</strong></p>
              <p>Gracias por tu puntualidad y compromiso</p>
              <p style="margin-top: 10px; color: #9ca3af;">Este es un correo automático, por favor no responder.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      attachments: [
        {
          filename: `Comprobante_Pago_${new Date(pago.mes_pago).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }).replace(/\s/g, '_')}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email con comprobante enviado a:', estudiante.email);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error enviando email con comprobante:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar notificación al admin cuando un estudiante sube un pago mensual
 */
async function enviarNotificacionPagoEstudiante(datosPago) {
  try {
    // Obtener todos los administradores activos
    const admins = await getActiveAdmins();
    const adminEmails = admins.map(admin => admin.email);

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Escuela Jessica Vélez'}" <${process.env.EMAIL_USER}>`,
      to: adminEmails.join(', '), // Enviar a todos los admins activos
      replyTo: process.env.EMAIL_USER,
      subject: `💰 Nuevo Pago Pendiente de Verificación - ${datosPago.estudiante_nombre}`,
      // Headers anti-spam
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'Escuela Jessica Vélez - Sistema de Gestión Académica',
        'X-Entity-Ref-ID': `notif-pago-${datosPago.id_pago}-${Date.now()}`,
        'List-Unsubscribe': `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
        'Precedence': 'bulk'
      },
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center; color: white; }
            .header h1 { margin: 0; font-size: 24px; }
            .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px; color: #92400e; }
            .content { padding: 30px; }
            .info-box { background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
            .info-row:last-child { border-bottom: none; }
            .label { font-weight: 600; color: #374151; }
            .value { color: #6b7280; }
            .button { display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💰 Nuevo Pago Pendiente</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Un estudiante ha subido un comprobante de pago</p>
            </div>
            
            <div class="alert">
              <strong>⚠️ Acción Requerida:</strong> Debes verificar este pago para que el estudiante reciba su comprobante.
            </div>
            
            <div class="content">
              <h2 style="color: #1f2937; margin-top: 0;">Información del Estudiante</h2>
              <div class="info-box">
                <div class="info-row">
                  <span class="label">Nombre:</span>
                  <span class="value">${datosPago.estudiante_nombre} ${datosPago.estudiante_apellido}</span>
                </div>
                <div class="info-row">
                  <span class="label">Cédula:</span>
                  <span class="value">${datosPago.estudiante_cedula}</span>
                </div>
                <div class="info-row">
                  <span class="label">Email:</span>
                  <span class="value">${datosPago.estudiante_email}</span>
                </div>
                <div class="info-row">
                  <span class="label">Curso:</span>
                  <span class="value">${datosPago.curso_nombre}</span>
                </div>
              </div>
              
              <h2 style="color: #1f2937;">Detalles del Pago</h2>
              <div class="info-box">
                <div class="info-row">
                  <span class="label">Cuota #:</span>
                  <span class="value">${datosPago.numero_cuota}</span>
                </div>
                <div class="info-row">
                  <span class="label">Monto:</span>
                  <span class="value" style="color: #059669; font-weight: 600;">$${parseFloat(datosPago.monto).toFixed(2)}</span>
                </div>
                <div class="info-row">
                  <span class="label">Método de Pago:</span>
                  <span class="value">${datosPago.metodo_pago}</span>
                </div>
                <div class="info-row">
                  <span class="label">Fecha de Pago:</span>
                  <span class="value">${new Date(datosPago.fecha_pago).toLocaleDateString('es-EC')}</span>
                </div>
              </div>
              
              <div style="text-align: center;">
                </p>
              </div>
            </div>
            
            <div class="footer">
              <p style="margin: 5px 0;">Escuela Jessica Vélez</p>
              <p style="margin: 5px 0;">Tu carrera en belleza estética comienza aquí</p>
              <p style="margin: 5px 0; color: #9ca3af;">Este es un email automático del sistema de gestión académica</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Email de notificación de pago enviado al admin');
  } catch (error) {
    console.error('Error enviando email de notificación de pago:', error);
    throw error;
  }
}

/**
 * Enviar notificación de bloqueo de cuenta por pagos vencidos
 */
async function enviarNotificacionBloqueoCuenta(email, nombre, motivo) {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Escuela Jessica Vélez'}" <${process.env.EMAIL_USER}>`,
      to: email,
      replyTo: process.env.EMAIL_USER,
      subject: '⚠️ Aviso Importante: Suspensión Temporal de Cuenta',
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'Escuela Jessica Vélez - SGA'
      },
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center; color: white; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
            .content { padding: 30px; }
            .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .button { display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; text-align: center; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Suspensión de Cuenta</h1>
            </div>
            <div class="content">
              <p>Estimado/a <strong>${nombre}</strong>,</p>
              
              <div class="alert">
                <strong>Aviso Importante: Su cuenta ha sido suspendida temporalmente</strong>
              </div>

              <p><strong>Motivo:</strong> ${motivo}</p>

              <p style="line-height: 1.8;">
                Le informamos que su cuenta en el Aula Virtual ha sido suspendida debido a que presenta 
                <strong>cuotas de pago vencidas</strong>. Para poder reactivar su acceso y continuar con sus 
                estudios sin inconvenientes, es necesario que regularice su situación de pagos.
              </p>

              <p style="line-height: 1.8;">
                <strong>Por favor, acérquese al área administrativa de la Escuela</strong> para coordinar 
                la regularización de sus pagos pendientes. Nuestro equipo estará disponible para ayudarle 
                y encontrar la mejor solución.
              </p>

              <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #1e40af;">
                  <strong>📍 Horario de Atención:</strong><br>
                  Lunes a Sábado: 9:00 AM - 5:00 PM
                </p>
              </div>
            </div>
            <div class="footer">
              <p><strong>Escuela Jessica Vélez</strong></p>
              <p>Si cree que esto es un error, por favor contáctenos.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email de bloqueo enviado a:', email);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error enviando email de bloqueo:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar notificación de desbloqueo temporal
 */
async function enviarNotificacionDesbloqueoTemporal(email, nombre, fechaExpiracion) {
  try {
    const fechaFormateada = new Date(fechaExpiracion).toLocaleString('es-EC', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Escuela Jessica Vélez'}" <${process.env.EMAIL_USER}>`,
      to: email,
      replyTo: process.env.EMAIL_USER,
      subject: '🔓 Aviso: Desbloqueo Temporal de Cuenta',
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'Escuela Jessica Vélez - SGA'
      },
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; text-align: center; color: white; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
            .content { padding: 30px; }
            .alert { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔓 Desbloqueo Temporal</h1>
            </div>
            <div class="content">
              <p>Estimado/a <strong>${nombre}</strong>,</p>
              
              <div class="alert">
                <strong>Su cuenta ha sido desbloqueada temporalmente por 24 horas.</strong>
              </div>

              <p style="line-height: 1.8;">
                Se le ha concedido un plazo especial para que pueda regularizar sus pagos pendientes.
                Durante este tiempo, tendrá acceso completo a su Aula Virtual.
              </p>

              <p style="line-height: 1.8;">
                <strong>Este desbloqueo expirará el:</strong><br>
                📅 ${fechaFormateada}
              </p>

              <p style="line-height: 1.8;">
                Por favor, aproveche este tiempo para realizar el pago y subir su comprobante.
                Si no regulariza su situación antes de la fecha indicada, el sistema volverá a bloquear su cuenta automáticamente.
              </p>
            </div>
            <div class="footer">
              <p><strong>Escuela Jessica Vélez</strong></p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email de desbloqueo temporal enviado a:', email);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error enviando email de desbloqueo temporal:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  enviarNotificacionNuevaMatricula,
  enviarEmailBienvenidaEstudiante,
  enviarComprobantePagoMensual,
  enviarNotificacionPagoEstudiante,
  enviarNotificacionBloqueoCuenta,
  enviarNotificacionDesbloqueoTemporal
};
