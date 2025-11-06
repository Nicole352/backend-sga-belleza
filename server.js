require('dotenv').config();
const validateEnv = require('./src/utils/validateEnv');
const app = require('./src/app');
const { testConnection } = require('./src/config/database');
const initDatabase = require('./src/utils/initDatabase');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    validateEnv();

    await testConnection();

    await initDatabase();

    if (process.env.ENABLE_UPLOADS_DIR === 'true') {
      const fs = require('fs');
      const path = require('path');
      const uploadsDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
    }

    const server = http.createServer(app);

    const io = new Server(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production'
          ? ['https://tudominio.com']
          : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4173'],
        credentials: true
      }
    });

    // Mapa para relacionar userId -> socketId y permitir enviar eventos a usuarios específicos
    const userSockets = new Map();

    io.on('connection', (socket) => {
      console.log('🔌 Cliente conectado:', socket.id);

      // Evento para registrar un usuario con su socket
      socket.on('register', (userId) => {
        if (userId) {
          // Guardar en el mapa
          userSockets.set(userId, socket.id);
          
          // Unir al usuario a su "room" personal
          socket.join(`user_${userId}`);
          
          console.log(`👤 Usuario ${userId} registrado con socket ${socket.id} y room user_${userId}`);
          
          // Confirmar registro al cliente
          socket.emit('registered', { userId, socketId: socket.id });
        }
      });

      // Manejar desconexión y limpiar el mapa
      socket.on('disconnect', () => {
        for (const [userId, socketId] of userSockets.entries()) {
          if (socketId === socket.id) {
            userSockets.delete(userId);
            console.log(`👤 Usuario ${userId} desconectado`);
            break;
          }
        }
        console.log('🔌 Cliente desconectado:', socket.id);
      });
    });

    // Exponer io y userSockets a la app para que otros módulos puedan enviar eventos a usuarios específicos
    app.set('io', io);
    app.set('userSockets', userSockets);

    server.listen(PORT, () => {
      console.log(`🚀 Servidor SGA Belleza corriendo en puerto ${PORT}`);
      console.log(`📝 Ambiente: ${process.env.NODE_ENV}`);
      console.log(`🔗 API disponible en: http://localhost:${PORT}/api`);
      console.log(`🔌 WebSocket disponible en: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
};

startServer();