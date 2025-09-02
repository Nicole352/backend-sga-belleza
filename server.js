require('dotenv').config();
const app = require('./src/app');
const { testConnection } = require('./src/config/database');

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    // Probar conexión a BD
    await testConnection();
    
    // Crear directorio de uploads si no existe
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`🚀 Servidor SGA Belleza corriendo en puerto ${PORT}`);
      console.log(`📝 Ambiente: ${process.env.NODE_ENV}`);
      console.log(`🔗 API disponible en: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
};

startServer();