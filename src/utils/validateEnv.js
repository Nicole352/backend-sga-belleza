/**
 * Validar que todas las variables de entorno necesarias estén configuradas
 * Se ejecuta al inicio del servidor para prevenir errores en producción
 */
function validateEnv() {
  const required = [
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'DB_PORT',
    'JWT_SECRET',
    'EMAIL_USER',
    'RESEND_API_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('-ERROR: Faltan las siguientes variables de entorno:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n Verifica tu archivo .env');

    // Solo salir en producción
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.warn('Continuando en modo desarrollo con valores faltantes...\n');
    }
  } else {
    console.log('Variables de entorno validadas correctamente');
  }

  // Validar JWT_SECRET en producción
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === 'dev_secret') {
    console.error('ERROR: No puedes usar "dev_secret" como JWT_SECRET en producción');
    process.exit(1);
  }
}

module.exports = validateEnv;
