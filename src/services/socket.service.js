const emitSocketEvent = (req, event, data) => {
  const io = req.app.get('io');
  if (io) {
    io.emit(event, data);
    console.log(`📢 Evento '${event}' broadcast a todos los clientes`);
  }
};

const emitToUser = (req, userId, event, data) => {
  const io = req.app.get('io');
  const userSockets = req.app.get('userSockets');

  if (io && userSockets) {
    const socketId = userSockets.get(userId);
    if (socketId) {
      io.to(socketId).emit(event, data);
      console.log(`📤 Evento '${event}' enviado al usuario ${userId} (socket: ${socketId})`);
    } else {
      console.log(`⚠️ Usuario ${userId} no está conectado al WebSocket`);
    }
  }
};

module.exports = {
  emitSocketEvent,
  emitToUser
};
