const Message = require("../../models/conversations/messages-data-model");
const Conversation = require("../../models/conversations/conversation-data-model");
const Contact = require("../../models/conversations/contact-management-models");
const { RedisService } = require("../../models/churchgallery/redisCache");

class SocketController {
  constructor() {
    this.redisClient = new RedisService();
    this.connectedUsers = new Map(); //maaps userId to the socketId
  }

  // Handle authentication
  async handleAuthenticate(socket, data) {
    try {
      const { userId, token } = data;
      // Here you would validate the token
      // For now, we'll assume it's valid

      // Store user connection
      this.connectedUsers.set(userId, socket.id);
      socket.userId = userId;

      // Join a room with the user's ID for direct messaging
      socket.join(userId);

      console.log(`User ${userId} authenticated and connected`);
      socket.emit("authenticated", { success: true });

      // Update user's online status
      socket.broadcast.emit("user_status_change", { userId, status: "online" });

      return true;
    } catch (error) {
      console.error("Authentication error:", error.message);
      socket.emit("authenticated", {
        success: false,
        error: "Authentication failed",
      });
      return false;
    }
  }
  // Handle sending a message
  async handleSendMessage(socket, io, data) {
    try {
      const { receiverId, text, mediaData } = data;
      const senderId = socket.userId;

      if (!senderId) {
        socket.emit("error", { message: "Not authenticated" });
        return false;
      }

      let message;

      // Check if it's a text or media message
      if (mediaData) {
        message = await Message.createMediaMessage(
          { sender_id: senderId, receiver_id: receiverId, text: text || "" },
          mediaData
        );
      } else {
        message = await Message.createTextMessage({
          sender_id: senderId,
          receiver_id: receiverId,
          text,
        });
      }

      // Send message to receiver if they are online
      if (this.connectedUsers.has(receiverId)) {
        io.to(receiverId).emit("new_message", message);
      }

      // Confirm message delivery to sender
      socket.emit("message_sent", {
        messageId: message.message_id,
        status: "delivered",
        timestamp: message.sent_at,
      });

      return true;
    } catch (error) {
      console.error("Error sending message:", error.message);
      socket.emit("error", { message: error.message });
      return false;
    }
  }
  // Handle marking messages as read
  async handleMarkRead(socket, io, data) {
    try {
      const { senderId } = data;
      const receiverId = socket.userId;

      if (!receiverId) {
        socket.emit("error", { message: "Not authenticated" });
        return false;
      }

      const markedCount = await Conversation.markMessagesAsRead(
        receiverId,
        senderId
      );

      // Notify the original sender that their messages were read
      if (markedCount > 0 && this.connectedUsers.has(senderId)) {
        io.to(senderId).emit("messages_read", {
          by: receiverId,
          count: markedCount,
          timestamp: new Date().toISOString(),
        });
      }

      socket.emit("marked_read", { success: true, count: markedCount });
      return true;
    } catch (error) {
      console.error("Error marking messages as read:", error.message);
      socket.emit("error", { message: error.message });
      return false;
    }
  }
  // Handle typing indicators
  handleTyping(socket, io, data) {
    const { receiverId, isTyping } = data;
    const senderId = socket.userId;

    if (!senderId) {
      socket.emit("error", { message: "Not authenticated" });
      return false;
    }

    if (this.connectedUsers.has(receiverId)) {
      io.to(receiverId).emit("user_typing", {
        userId: senderId,
        isTyping,
      });
    }

    return true;
  }
  // Handle message deletion
  async handleDeleteMessage(socket, io, data) {
    try {
      const { messageId, receiverId } = data;
      const userId = socket.userId;

      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return false;
      }

      const deleted = await Message.deleteMessage(messageId, userId);

      if (deleted) {
        // Notify the receiver about the deleted message
        if (this.connectedUsers.has(receiverId)) {
          io.to(receiverId).emit("message_deleted", { messageId });
        }

        socket.emit("message_deleted", {
          success: true,
          messageId,
        });

        return true;
      } else {
        socket.emit("message_deleted", {
          success: false,
          error: "Failed to delete message",
        });

        return false;
      }
    } catch (error) {
      console.error("Error deleting message:", error.message);
      socket.emit("error", { message: error.message });
      return false;
    }
  }
  // Handle getting online contacts
  async handleGetOnlineContacts(socket) {
    try {
      const userId = socket.userId;

      if (!userId) {
        socket.emit("error", { message: "Not authenticated" });
        return false;
      }

      const contacts = await Contact.getUserContacts(userId);

      // Filter only online contacts
      const onlineContacts = contacts
        .filter((contact) => this.connectedUsers.has(contact.contact_user_id))
        .map((contact) => ({
          contact_id: contact.contact_id,
          user_id: contact.contact_user_id,
          name: contact.full_name,
          avatar: contact.profile_picture_url,
        }));

      socket.emit("online_contacts", { contacts: onlineContacts });
      return true;
    } catch (error) {
      console.error("Error getting online contacts:", error.message);
      socket.emit("error", { message: error.message });
      return false;
    }
  }
  // Handle user disconnection
  handleDisconnect(socket, io) {
    if (socket.userId) {
      this.connectedUsers.delete(socket.userId);
      io.emit("user_status_change", {
        userId: socket.userId,
        status: "offline",
        timestamp: new Date().toISOString(),
      });
      console.log(`User ${socket.userId} disconnected`);
    }
  }

  // Get all connected users
  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  // Check if a user is online
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }
}
module.exports = new SocketController();
