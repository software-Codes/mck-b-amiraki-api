const Message = require("../../models/conversations/messages-data-model");
const Conversation = require("../../models/conversations/conversation-data-model");
const Contact = require("../../models/conversations/contact-management-models");
const socketService = require("../../services/SocketService");

class ChatController {
  constructor(socketService) {
    this.socketService = socketService;
  }

  // Get conversation history
  async getConversationHistory(req, res) {
    try {
      const { userId } = req.user; // Assuming you have auth middleware
      const { contactId, page, limit } = req.query;

      const messages = await Conversation.getConversationHistory(
        userId,
        contactId,
        parseInt(page) || 1,
        parseInt(limit) || 20
      );

      // Mark messages as read when viewed
      await Conversation.markMessagesAsRead(userId, contactId);

      // Notify the sender that their messages were read
      if (this.socketService.isUserOnline(contactId)) {
        this.socketService.emitToUser(contactId, "messages_read", {
          by: userId,
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (error) {
      console.error("Error getting conversation history:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
  // Get all conversations for a user
  async getUserConversations(req, res) {
    try {
      const { userId } = req.user;
      const { page, limit } = req.query;

      const conversations = await Conversation.getUserConversations(
        userId,
        parseInt(page) || 1,
        parseInt(limit) || 20
      );

      // Add online status to each contact
      const conversationsWithStatus = conversations.map((conv) => ({
        ...conv,
        is_online: this.socketService.isUserOnline(conv.contact_id),
      }));

      return res.status(200).json({
        success: true,
        data: conversationsWithStatus,
      });
    } catch (error) {
      console.error("Error getting user conversations:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
  // Send a message via HTTP (fallback for socket)
  async sendMessage(req, res) {
    try {
      const { userId } = req.user;
      const { receiverId, text, mediaData } = req.body;

      let message;

      if (mediaData) {
        message = await Message.createMediaMessage(
          { sender_id: userId, receiver_id: receiverId, text: text || "" },
          mediaData
        );
      } else {
        message = await Message.createTextMessage({
          sender_id: userId,
          receiver_id: receiverId,
          text,
        });
      }

      // Notify the receiver if they are online
      if (this.socketService.isUserOnline(receiverId)) {
        this.socketService.emitToUser(receiverId, "new_message", message);
      }

      return res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error) {
      console.error("Error sending message:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
  // Get unread message count
  async getUnreadMessageCount(req, res) {
    try {
      const { userId } = req.user;

      const unreadCount = await Message.getUnreadMessageCount(userId);

      return res.status(200).json({
        success: true,
        data: unreadCount,
      });
    } catch (error) {
      console.error("Error getting unread count:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
  // Get user contacts with online status
  async getContacts(req, res) {
    try {
      const { userId } = req.user;
      const { page, limit, search } = req.query;

      const contacts = await Contact.getUserContacts(
        userId,
        parseInt(page) || 1,
        parseInt(limit) || 50,
        search || ""
      );

      // Add online status
      const contactsWithStatus = contacts.map((contact) => ({
        ...contact,
        is_online: this.socketService.isUserOnline(contact.contact_user_id),
      }));

      return res.status(200).json({
        success: true,
        data: contactsWithStatus,
      });
    } catch (error) {
      console.error("Error getting contacts:", error.message);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

}
module .exports =  ChatController;