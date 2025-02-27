const { text } = require("pdfkit");
const { sql } = require("../../config/database");
//send new message
const sendMessage = async (senderId, receiverId, text, mediaId = null) => {
  try {
    const message = await sql`
    INSERT INTO messages (sender_id, receiver_id, text, media_id)
    VALUES (${senderId}, ${receiverId}, ${text}, ${mediaId})
    RETURNING *'
        `;
    return message[0];
  } catch (error) {
    throw new Error("Error Sending message:" + error.message);
  }
};
// Get message history
const getMessages = async (chatId) => {
  try {
    const messages = await sql`
        SELECT m.*,
        u.full_name As sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE (m.sender_id = ${chatId} OR m.receiver_id = ${chatId} )
        ORDER_BY m.sent_at ASC
        `;
    return messages;
  } catch (error) {
    throw new Error("Error Fetching messages: " + error.message);
  }
};

// Mark message as read
const markMessageAsRead = async (messageId, userId) => {
  try {
    const result = await sql`
        UPDATE messages
        SET read_at = NOW()
        WHERE message_id = ${messageId}
        AND receiver_id = ${userId}
        RETURNING *;
      `;

    return result[0];
  } catch (error) {
    throw new Error("Error marking message as read: " + error.message);
  }
};

module.exports = {
  sendMessage,
  getMessages,
  markMessageAsRead,
};
