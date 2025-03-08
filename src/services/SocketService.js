// services/SocketService.js
const socketIO = require('socket.io');
const SocketController = require('../controllers/socket/socketController');

class SocketService {
  constructor(server) {
    this.io = socketIO(server);
    this.controller = new SocketController();
    this.initialize();
  }

  initialize() {
    this.io.on('connection', (socket) => {
      console.log('New client connected:', socket.id);
      
      // Authenticate user
      socket.on('authenticate', (data) => {
        this.controller.handleAuthenticate(socket, data);
      });

      // Handle sending a message
      socket.on('send_message', (data) => {
        this.controller.handleSendMessage(socket, this.io, data);
      });

      // Handle marking messages as read
      socket.on('mark_read', (data) => {
        this.controller.handleMarkRead(socket, this.io, data);
      });

      // Handle typing indicators
      socket.on('typing', (data) => {
        this.controller.handleTyping(socket, this.io, data);
      });

      // Handle message deletion
      socket.on('delete_message', (data) => {
        this.controller.handleDeleteMessage(socket, this.io, data);
      });

      // Handle getting online contacts
      socket.on('get_online_contacts', () => {
        this.controller.handleGetOnlineContacts(socket);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.controller.handleDisconnect(socket, this.io);
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  // Utility method to emit to a specific user
  emitToUser(userId, event, data) {
    if (this.controller.isUserOnline(userId)) {
      this.io.to(userId).emit(event, data);
      return true;
    }
    return false;
  }

  // Broadcast to all connected users
  broadcast(event, data) {
    this.io.emit(event, data);
  }

  // Get all connected users
  getConnectedUsers() {
    return this.controller.getConnectedUsers();
  }

  // Check if a user is online
  isUserOnline(userId) {
    return this.controller.isUserOnline(userId);
  }
}

module.exports = SocketService;