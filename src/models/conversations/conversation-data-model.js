// models/Conversation.js
const { sql } = require("../../config/database");
const { RedisService } = require("../../services/redisCaching");
const redisClient = new RedisService();

class Conversation {
  /**
   * Creates a new conversation or returns existing one between users
   * @param {UUID} userId1 - First user's ID
   * @param {UUID} userId2 - Second user's ID
   * @returns {Object} - Conversation details
   */
  static async getOrCreateConversation(userId1, userId2) {
    try {
      // Check cache first
      const cacheKey = `conversation:${[userId1, userId2].sort().join(':')}`;
      const cachedConversation = await redisClient.get(cacheKey);
      
      if (cachedConversation) {
        return cachedConversation;
      }

      // Try to find existing conversation
      const query = `
        WITH user_contacts AS (
          SELECT contact_user_id 
          FROM contacts 
          WHERE user_id = $1 AND contact_user_id = $2
          UNION
          SELECT contact_user_id 
          FROM contacts 
          WHERE user_id = $2 AND contact_user_id = $1
        )
        SELECT 
          CASE WHEN COUNT(*) > 0 
            THEN TRUE 
            ELSE FALSE 
          END as are_contacts
        FROM user_contacts;
      `;
      
      const areContacts = await sql(query, [userId1, userId2]);
      
      if (!areContacts.length || !areContacts[0].are_contacts) {
        throw new Error("Users are not contacts");
      }

      // Create conversation metadata (not storing in DB, just for reference)
      const conversationData = {
        participants: [userId1, userId2].sort(),
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      };
      
      // Cache the conversation data
      await redisClient.set(cacheKey, conversationData, 86400); // 24 hours
      
      return conversationData;
    } catch (error) {
      console.error("Error in getOrCreateConversation:", error.message);
      throw error;
    }
  }

  /**
   * Get conversation history between two users with pagination
   * @param {UUID} userId1 - First user's ID
   * @param {UUID} userId2 - Second user's ID
   * @param {number} page - Page number (starting from 1)
   * @param {number} limit - Number of messages per page
   * @returns {Array} - Array of messages
   */
  static async getConversationHistory(userId1, userId2, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      
      // Generate cache key for this specific page of conversation
      const cacheKey = `conversation:${[userId1, userId2].sort().join(':')}:messages:page${page}:limit${limit}`;
      const cachedMessages = await redisClient.get(cacheKey);
      
      if (cachedMessages) {
        return cachedMessages;
      }

      const query = `
        SELECT 
          m.message_id,
          m.sender_id,
          m.receiver_id,
          m.text,
          m.media_id,
          m.sent_at,
          m.read_at,
          mc.content_type as media_type,
          mc.url as media_url,
          mc.thumbnail_url,
          u.full_name as sender_name,
          u.profile_picture_url as sender_avatar
        FROM messages m
        LEFT JOIN media_contents mc ON m.media_id = mc.id
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE 
          (m.sender_id = $1 AND m.receiver_id = $2) OR
          (m.sender_id = $2 AND m.receiver_id = $1)
        ORDER BY m.sent_at DESC
        LIMIT $3 OFFSET $4;
      `;
      
      const messages = await sql(query, [userId1, userId2, limit, offset]);
      
      // Cache results for faster subsequent retrievals
      await redisClient.set(cacheKey, messages, 3600); // 1 hour cache
      
      return messages;
    } catch (error) {
      console.error("Error in getConversationHistory:", error.message);
      throw error;
    }
  }

  /**
   * Mark messages as read
   * @param {UUID} receiverId - Receiver's user ID
   * @param {UUID} senderId - Sender's user ID
   * @returns {number} - Number of messages marked as read
   */
  static async markMessagesAsRead(receiverId, senderId) {
    try {
      const query = `
        UPDATE messages
        SET 
          read_at = NOW(),
          updated_at = NOW()
        WHERE 
          receiver_id = $1 AND 
          sender_id = $2 AND
          read_at IS NULL
        RETURNING message_id;
      `;
      
      const result = await sql(query, [receiverId, senderId]);
      
      // Invalidate relevant cache
      const cachePattern = `conversation:*${[receiverId, senderId].sort().join(':*')}*`;
      await redisClient.invalidate(cachePattern);
      
      return result.length;
    } catch (error) {
      console.error("Error in markMessagesAsRead:", error.message);
      throw error;
    }
  }

  /**
   * Get all conversations for a user with last message preview
   * @param {UUID} userId - User ID 
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Array} - List of conversations with last message
   */
  static async getUserConversations(userId, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      const cacheKey = `user:${userId}:conversations:page${page}:limit${limit}`;
      const cachedConversations = await redisClient.get(cacheKey);
      
      if (cachedConversations) {
        return cachedConversations;
      }

      const query = `
        WITH user_contacts AS (
          SELECT contact_user_id 
          FROM contacts 
          WHERE user_id = $1
        ),
        latest_messages AS (
          SELECT DISTINCT ON (
            CASE 
              WHEN sender_id = $1 THEN receiver_id 
              ELSE sender_id 
            END
          ) 
            message_id,
            CASE 
              WHEN sender_id = $1 THEN receiver_id 
              ELSE sender_id 
            END as contact_id,
            sender_id,
            text,
            media_id,
            sent_at,
            read_at
          FROM messages
          WHERE 
            sender_id = $1 OR receiver_id = $1
          ORDER BY 
            contact_id, 
            sent_at DESC
        )
        SELECT 
          lm.message_id,
          lm.contact_id,
          u.full_name as contact_name,
          u.profile_picture_url as contact_avatar,
          lm.sender_id = $1 as is_sender,
          lm.text,
          lm.media_id IS NOT NULL as has_media,
          lm.sent_at,
          lm.read_at,
          (
            SELECT COUNT(*) 
            FROM messages 
            WHERE 
              sender_id = lm.contact_id AND 
              receiver_id = $1 AND 
              read_at IS NULL
          ) as unread_count
        FROM latest_messages lm
        JOIN users u ON lm.contact_id = u.id
        JOIN user_contacts uc ON lm.contact_id = uc.contact_user_id
        ORDER BY lm.sent_at DESC
        LIMIT $2 OFFSET $3;
      `;
      
      const conversations = await sql(query, [userId, limit, offset]);
      
      // Cache results
      await redisClient.set(cacheKey, conversations, 1800); // 30 minutes
      
      return conversations;
    } catch (error) {
      console.error("Error in getUserConversations:", error.message);
      throw error;
    }
  }
    /**
   * Get message status timeline
   * @param {UUID} messageId - Message ID
   * @returns {Object} - Status timeline
   */
    static async getMessageTimeline(messageId) {
      try {
        const query = `
          SELECT 
            sent_at,
            delivered_at,
            read_at,
            deleted_at,
            status
          FROM messages
          WHERE message_id = $1;
        `;
        
        const result = await sql(query, [messageId]);
        return result[0];
      } catch (error) {
        console.error("Error in getMessageTimeline:", error.message);
        throw error;
      }
    }
      /**
   * Get conversation status summary
   * @param {UUID} userId1 - First user ID
   * @param {UUID} userId2 - Second user ID
   * @returns {Object} - Conversation status summary
   */
  static async getConversationStatusSummary(userId1, userId2) {
    try {
      const query = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'sent') AS sent_count,
          COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_count,
          COUNT(*) FILTER (WHERE status = 'read') AS read_count,
          COUNT(*) FILTER (WHERE status = 'deleted') AS deleted_count,
          MAX(sent_at) AS last_message_time
        FROM messages
        WHERE (sender_id = $1 AND receiver_id = $2)
           OR (sender_id = $2 AND receiver_id = $1);
      `;
      
      const result = await sql(query, [userId1, userId2]);
      return result[0];
    } catch (error) {
      console.error("Error in getConversationStatusSummary:", error.message);
      throw error;
    }
  }
}

module.exports = Conversation;