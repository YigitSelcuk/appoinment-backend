let io = null;

const setIO = (socketInstance) => {
  io = socketInstance;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

module.exports = { setIO, getIO };