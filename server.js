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
    const userRoles = new Map(); // Mapa para relacionar userId -> rol

    io.on('connection', (socket) => {
      console.log('🔌 Cliente conectado:', socket.id);

      // Evento para registrar un usuario con su socket y rol
      socket.on('register', (userData) => {
        // userData puede ser un número (userId) o un objeto {userId, rol}
        let userId, rol;
        
        if (typeof userData === 'number') {
          userId = userData;
          // Si es solo número, intentar obtener rol del token (si está disponible)
          rol = 'unknown';
        } else if (typeof userData === 'object') {
          userId = userData.userId || userData.id_usuario;
          rol = userData.rol;
        } else {
          return;
        }

        if (userId) {
          // Guardar en los mapas
          userSockets.set(userId, socket.id);
          if (rol && rol !== 'unknown') {
            userRoles.set(userId, rol);
          }
          
          // Unir al usuario a su "room" personal
          socket.join(`user_${userId}`);
          
          // Unir al usuario a su "room" por rol (si está disponible)
          if (rol && rol !== 'unknown') {
            socket.join(`rol_${rol}`);
            console.log(`👤 Usuario ${userId} (${rol}) registrado con socket ${socket.id}, rooms: user_${userId}, rol_${rol}`);
          } else {
            console.log(`👤 Usuario ${userId} registrado con socket ${socket.id}, rooms: user_${userId}`);
          }
          
          // Confirmar registro al cliente
          socket.emit('registered', { userId, socketId: socket.id, rol });
        }
      });

      // Manejar desconexión y limpiar los mapas
      socket.on('disconnect', () => {
        for (const [userId, socketId] of userSockets.entries()) {
          if (socketId === socket.id) {
            const rol = userRoles.get(userId);
            userSockets.delete(userId);
            userRoles.delete(userId);
            if (rol) {
              console.log(`👤 Usuario ${userId} (${rol}) desconectado`);
            } else {
              console.log(`👤 Usuario ${userId} desconectado`);
            }
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