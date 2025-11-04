require('dotenv').config();
const validateEnv = require('./src/utils/validateEnv');
const app = require('./src/app');
const { testConnection } = require('./src/config/database');
const initDatabase = require('./src/utils/initDatabase');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Validar variables de entorno antes de iniciar
    validateEnv();
    
    // Probar conexión a BD
    await testConnection();
    
    // Initialize database tables
    await initDatabase();
    
    // Crear directorio de uploads si está habilitado por env (por defecto deshabilitado).
    // Nota: Actualmente los comprobantes se guardan en BD (LONGBLOB) con multer.memoryStorage.
    if (process.env.ENABLE_UPLOADS_DIR === 'true') {
      const fs = require('fs');
      const path = require('path');
      const uploadsDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
    }
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`🚀 Servidor SGA Belleza corriendo en puerto ${PORT}`);
      console.log(`📝 Ambiente: ${process.env.NODE_ENV}`);
      console.log(`🔗 API disponible en: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('-Error iniciando servidor:', error);
    process.exit(1);
  }
};

startServer();