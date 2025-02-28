const socketIo = require("socket.io");
const Message = require("../models/conversations/messages-data-model");
const Conversation = require("../models/conversations/conversation-data-model");
const { RedisService } = require("../config/redis");
const Contact = require("../models/conversations/contact-management-models");

class SocketService {
  constructor(server) {
    this.io = socketIo(server);
    this.redisClient = new RedisService();
    this.connectedUsers = new Map(); // Maps userId to socketId
    this.initialize();
  }

  initialize() {
    this.io.on("connection", (socket) => {
      console.log("New client connected:", socket.id);

      // Authenticate user and store their connection
      socket.on("authenticate", async (data) => {
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
          this.io.emit("user_status_change", { userId, status: "online" });
        } catch (error) {
          console.error("Authentication error:", error.message);
          socket.emit("authenticated", {
            success: false,
            error: "Authentication failed",
          });
        }
      });

      // Handle sending a message
      socket.on("send_message", async (data) => {
        try {
          const { receiverId, text, mediaData } = data;
          const senderId = socket.userId;

          if (!senderId) {
            return socket.emit("error", { message: "Not authenticated" });
          }

          let message;

          // Check if it's a text or media message
          if (mediaData) {
            message = await Message.createMediaMessage(
              {
                sender_id: senderId,
                receiver_id: receiverId,
                text: text || "",
              },
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
          const receiverSocketId = this.connectedUsers.get(receiverId);
          if (receiverSocketId) {
            this.io.to(receiverId).emit("new_message", {
              ...message,
              sender_name: socket.userName, // You would need to store this during authentication
            });
          }

          // Confirm message delivery to sender
          socket.emit("message_sent", {
            messageId: message.message_id,
            status: "delivered",
            timestamp: message.sent_at,
          });
        } catch (error) {
          console.error("Error sending message:", error.message);
          socket.emit("error", { message: error.message });
        }
      });

      // Handle marking messages as read
      socket.on("mark_read", async (data) => {
        try {
          const { senderId } = data;
          const receiverId = socket.userId;

          if (!receiverId) {
            return socket.emit("error", { message: "Not authenticated" });
          }

          const markedCount = await Conversation.markMessagesAsRead(
            receiverId,
            senderId
          );

          // Notify the original sender that their messages were read
          if (markedCount > 0) {
            const senderSocketId = this.connectedUsers.get(senderId);
            if (senderSocketId) {
              this.io.to(senderId).emit("messages_read", {
                by: receiverId,
                count: markedCount,
              });
            }
          }

          socket.emit("marked_read", { success: true, count: markedCount });
        } catch (error) {
          console.error("Error marking messages as read:", error.message);
          socket.emit("error", { message: error.message });
        }
      });

      // Handle typing indicators
      socket.on("typing", (data) => {
        const { receiverId, isTyping } = data;
        const senderId = socket.userId;

        if (!senderId) {
          return socket.emit("error", { message: "Not authenticated" });
        }

        const receiverSocketId = this.connectedUsers.get(receiverId);
        if (receiverSocketId) {
          this.io.to(receiverId).emit("user_typing", {
            userId: senderId,
            isTyping,
          });
        }
      });

      // Handle message deletion
      socket.on("delete_message", async (data) => {
        try {
          const { messageId, receiverId } = data;
          const userId = socket.userId;

          if (!userId) {
            return socket.emit("error", { message: "Not authenticated" });
          }

          const deleted = await Message.deleteMessage(messageId, userId);

          if (deleted) {
            // Notify the receiver about the deleted message
            const receiverSocketId = this.connectedUsers.get(receiverId);
            if (receiverSocketId) {
              this.io.to(receiverId).emit("message_deleted", { messageId });
            }

            socket.emit("message_deleted", {
              success: true,
              messageId,
            });
          } else {
            socket.emit("message_deleted", {
              success: false,
              error: "Failed to delete message",
            });
          }
        } catch (error) {
          console.error("Error deleting message:", error.message);
          socket.emit("error", { message: error.message });
        }
      });

      // Handle user presence
      socket.on("get_online_contacts", async () => {
        try {
          const userId = socket.userId;

          if (!userId) {
            return socket.emit("error", { message: "Not authenticated" });
          }

          // You would need to implement this in Contact model
          // or you could use the existing getUserContacts method
          const contacts = await Contact.getUserContacts(userId);

          // Filter only online contacts
          const onlineContacts = contacts
            .filter((contact) =>
              this.connectedUsers.has(contact.contact_user_id)
            )
            .map((contact) => contact.contact_user_id);

          socket.emit("online_contacts", { contacts: onlineContacts });
        } catch (error) {
          console.error("Error getting online contacts:", error.message);
          socket.emit("error", { message: error.message });
        }
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        if (socket.userId) {
          this.connectedUsers.delete(socket.userId);
          this.io.emit("user_status_change", {
            userId: socket.userId,
            status: "offline",
          });
          console.log(`User ${socket.userId} disconnected`);
        }
        console.log("Client disconnected:", socket.id);
      });
    });
  }

  // Utility method to emit to a specific user
  emitToUser(userId, event, data) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(userId).emit(event, data);
      return true;
    }
    return false;
  }

  // Broadcast to all connected users
  broadcast(event, data) {
    this.io.emit(event, data);
  }
}

module.exports = SocketService;
