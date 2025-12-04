let ioInstance;
let userSocketsInstance;

const initSocket = (io, userSockets) => {
  ioInstance = io;
  userSocketsInstance = userSockets;
  console.log('Socket Service inicializado con instancia global');
};

const getIo = (req) => {
  if (req && req.app && req.app.get) {
    return req.app.get('io');
  }
  return ioInstance;
};

const getUserSockets = (req) => {
  if (req && req.app && req.app.get) {
    return req.app.get('userSockets');
  }
  return userSocketsInstance;
};

const emitSocketEvent = (req, event, data) => {
  const io = getIo(req);
  if (io) {
    io.emit(event, data);
    console.log(`Evento '${event}' broadcast a todos los clientes`);
  }
};

const emitToUser = (req, userId, event, data) => {
  const io = getIo(req);
  const userSockets = getUserSockets(req);

  // Si req es un número (userId) y userId es string (event), ajustar argumentos
  // Esto permite llamar a la función como emitToUser(userId, event, data) sin req
  if (typeof req === 'number' && typeof userId === 'string') {
    data = event;
    event = userId;
    userId = req;
    req = null;
  }

  if (io && userSockets) {
    const socketId = userSockets.get(userId);
    if (socketId) {
      io.to(socketId).emit(event, data);
      console.log(`Evento '${event}' enviado al usuario ${userId} (socket: ${socketId})`);
    } else {
      console.log(`Usuario ${userId} no está conectado al WebSocket`);
    }
  } else {
    console.warn('Socket.io no inicializado o no disponible');
  }
};

const emitToRole = (req, role, event, data) => {
  const io = getIo(req);

  // Ajuste de argumentos si se llama sin req
  if (typeof req === 'string' && typeof role === 'string' && typeof event === 'object') {
    data = event;
    event = role;
    role = req;
    req = null;
  }

  if (io) {
    io.to(`rol_${role}`).emit(event, data);
    console.log(`Evento '${event}' enviado al rol ${role}`);
  }
};

const emitToCurso = (req, id_curso, event, data) => {
  const io = getIo(req);

  // Ajuste de argumentos si se llama sin req
  if (typeof req === 'number' && typeof id_curso === 'string') {
    data = event;
    event = id_curso;
    id_curso = req;
    req = null;
  }

  if (io) {
    io.to(`curso_${id_curso}`).emit(event, data);
    console.log(`Evento '${event}' enviado al curso ${id_curso}`);
  }
};

module.exports = {
  initSocket,
  emitSocketEvent,
  emitToUser,
  emitToRole,
  emitToCurso
};
