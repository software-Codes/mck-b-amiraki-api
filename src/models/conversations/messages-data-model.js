const { sql } = require("../../config/database");

/**
 * Message model class for handling message operations
 * This class provides methods for creating, updating, and retrieving messages,
 * including text messages, media messages, and message status management.
 */
class Message {
  /**
   * Create a new text message
   * @param {Object} messageData - Message data
   * @param {string} messageData.sender_id - Sender's user ID
   * @param {string} messageData.receiver_id - Receiver's user ID
   * @param {string} messageData.text - Message text content
   * @returns {Promise<Object>} - Created message object
   * @throws {Error} - Throws if users are not contacts or database operation fails
   */
  static async createTextMessage(messageData) {
    try {
      const { sender_id, receiver_id, text } = messageData;

      // Validate that users are contacts
      const contactQuery = `
        SELECT COUNT(*) as contact_exists 
        FROM contacts 
        WHERE 
          (user_id = $1 AND contact_user_id = $2) OR
          (user_id = $2 AND contact_user_id = $1);
      `;

      const contactResult = await sql(contactQuery, [sender_id, receiver_id]);

      if (contactResult[0].contact_exists === 0) {
        throw new Error("Users are not contacts");
      }

      // Insert message
      const query = `
        INSERT INTO messages (
          sender_id, 
          receiver_id, 
          text
        )
        VALUES ($1, $2, $3)
        RETURNING 
          message_id, 
          sender_id, 
          receiver_id, 
          text, 
          sent_at,
          created_at;
      `;

      const message = await sql(query, [sender_id, receiver_id, text]);

      return message[0];
    } catch (error) {
      console.error("Error in createTextMessage:", error.message);
      throw error;
    }
  }

  /**
   * Create a new media message
   * @param {Object} messageData - Message data
   * @param {string} messageData.sender_id - Sender's user ID
   * @param {string} messageData.receiver_id - Receiver's user ID
   * @param {string} messageData.text - Optional text caption
   * @param {Object} mediaData - Media content data
   * @param {string} mediaData.title - Media title
   * @param {string} mediaData.description - Media description
   * @param {string} mediaData.content_type - Media type (image, video, audio)
   * @param {string} mediaData.url - Media URL in Azure Blob Storage
   * @param {string} [mediaData.thumbnail_url=null] - Thumbnail URL (optional)
   * @param {number} mediaData.size - File size in bytes
   * @param {number} [mediaData.duration=null] - Media duration (for audio/video)
   * @returns {Promise<Object>} - Created message with media information
   * @throws {Error} - Throws if users are not contacts or database operation fails
   */
  static async createMediaMessage(messageData, mediaData) {
    try {
      const { sender_id, receiver_id, text = "" } = messageData;
      const {
        title,
        description,
        content_type,
        url,
        thumbnail_url = null,
        size,
        duration = null,
      } = mediaData;

      // Begin transaction
      await sql`BEGIN`;

      try {
        // Insert media content first
        const mediaQuery = `
          INSERT INTO media_contents (
            title,
            description,
            content_type,
            url,
            thumbnail_url,
            uploaded_by,
            size,
            duration
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id;
        `;

        const mediaResult = await sql(mediaQuery, [
          title,
          description,
          content_type,
          url,
          thumbnail_url,
          sender_id,
          size,
          duration,
        ]);

        const media_id = mediaResult[0].id;

        // Insert message with media reference
        const messageQuery = `
          INSERT INTO messages (
            sender_id,
            receiver_id,
            text,
            media_id
          )
          VALUES ($1, $2, $3, $4)
          RETURNING 
            message_id, 
            sender_id, 
            receiver_id, 
            text, 
            media_id, 
            sent_at,
            created_at;
        `;

        const message = await sql(messageQuery, [
          sender_id,
          receiver_id,
          text,
          media_id,
        ]);

        // Commit transaction
        await sql`COMMIT`;

        return {
          ...message[0],
          media: {
            id: media_id,
            content_type,
            url,
            thumbnail_url,
          },
        };
      } catch (error) {
        // Rollback transaction in case of error
        await sql`ROLLBACK`;
        throw error;
      }
    } catch (error) {
      console.error("Error in createMediaMessage:", error.message);
      throw error;
    }
  }

  /**
   * Update message delivery status to 'delivered'
   * @param {string} messageId - Message ID to update
   * @returns {Promise<Object>} - Updated message object
   * @throws {Error} - Throws if message update fails
   */
  static async markAsDelivered(messageId) {
    try {
      const query = `
        UPDATE messages
        SET 
          status = 'delivered',
          delivered_at = NOW(),
          updated_at = NOW()
        WHERE message_id = $1
        RETURNING *;
      `;

      const result = await sql(query, [messageId]);
      return result[0];
    } catch (error) {
      console.error("Error in markAsDelivered:", error.message);
      throw error;
    }
  }

  /**
   * Get unread message count for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Object containing total unread count and breakdown by sender
   * @throws {Error} - Throws if query execution fails
   */
  static async getUnreadMessageCount(userId) {
    try {
      // Get total unread count
      const totalQuery = `
        SELECT COUNT(*) as total_unread
        FROM messages
        WHERE receiver_id = $1 AND read_at IS NULL;
      `;

      const totalResult = await sql(totalQuery, [userId]);

      // Get breakdown by sender
      const breakdownQuery = `
        SELECT 
          sender_id,
          u.full_name as sender_name,
          COUNT(*) as unread_count
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE 
          receiver_id = $1 AND 
          read_at IS NULL
        GROUP BY sender_id, u.full_name
        ORDER BY unread_count DESC;
      `;

      const breakdown = await sql(breakdownQuery, [userId]);

      const result = {
        total_unread: totalResult[0].total_unread,
        breakdown,
      };

      return result;
    } catch (error) {
      console.error("Error in getUnreadMessageCount:", error.message);
      throw error;
    }
  }

  /**
   * Delete a message by marking it as 'deleted'
   * @param {string} messageId - Message ID to delete
   * @param {string} userId - User ID requesting deletion (must be sender)
   * @returns {Promise<Object>} - Deleted message object
   * @throws {Error} - Throws if deletion fails or user is not authorized
   */
  static async deleteMessage(messageId, userId) {
    try {
      const query = `
        UPDATE messages
        SET 
          status = 'deleted',
          deleted_at = NOW(),
          updated_at = NOW()
        WHERE message_id = $1
          AND sender_id = $2
        RETURNING *;
      `;

      const result = await sql(query, [messageId, userId]);
      return result[0];
    } catch (error) {
      console.error("Error in deleteMessage:", error.message);
      throw error;
    }
  }

  /**
   * Get message delivery status
   * @param {string} messageId - Message ID
   * @returns {Promise<Object>} - Message status information
   * @throws {Error} - Throws if message not found or query fails
   */
  static async getMessageStatus(messageId) {
    try {
      const query = `
        SELECT 
          message_id,
          sent_at,
          read_at,
          CASE
            WHEN read_at IS NOT NULL THEN 'read'
            ELSE 'delivered'
          END as status
        FROM messages
        WHERE message_id = $1;
      `;

      const result = await sql(query, [messageId]);

      if (!result.length) {
        throw new Error("Message not found");
      }

      return result[0];
    } catch (error) {
      console.error("Error in getMessageStatus:", error.message);
      throw error;
    }
  }
}

module.exports = Message;
