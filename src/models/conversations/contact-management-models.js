const { sql } = require("../../config/database");
// models/Contact.js

/**
 * Contact model class for managing user contacts
 * This class provides methods for adding, removing, and retrieving user contacts,
 * as well as importing contacts from phone numbers and checking online status.
 */
class Contact {
  /**
   * Add a new contact for a user
   * @param {string} userId - The ID of the user adding the contact
   * @param {string} contactUserId - The ID of the user to add as a contact
   * @returns {Promise<Object>} - An object containing the contact ID and existence status
   * @throws {Error} - Throws an error if the operation fails
   */
  static async addContact(userId, contactUserId) {
    try {
      // Prevent adding self as contact
      if (userId === contactUserId) {
        throw new Error("Cannot add yourself as a contact");
      }

      // Check if contactUserId exists in users table
      const userCheckQuery = `
        SELECT id FROM users WHERE id = $1;
      `;

      const userExists = await sql(userCheckQuery, [contactUserId]);

      if (!userExists.length) {
        throw new Error("User not found");
      }

      // Check if contact already exists
      const checkQuery = `
        SELECT contact_id FROM contacts
        WHERE user_id = $1 AND contact_user_id = $2;
      `;

      const existingContact = await sql(checkQuery, [userId, contactUserId]);

      if (existingContact.length > 0) {
        return {
          contact_id: existingContact[0].contact_id,
          already_exists: true,
        };
      }

      // Insert new contact
      const query = `
        INSERT INTO contacts (user_id, contact_user_id)
        VALUES ($1, $2)
          RETURNING contact_id, created_at;
      `;

      const contact = await sql(query, [userId, contactUserId]);

      return { ...contact[0], already_exists: false };
    } catch (error) {
      console.error("Error in addContact:", error.message);
      throw error;
    }
  }

  /**
   * Remove a contact from a user's contact list
   * @param {string} userId - The ID of the user removing the contact
   * @param {string} contactUserId - The ID of the user to remove as a contact
   * @returns {Promise<boolean>} - True if the contact was successfully removed, false otherwise
   * @throws {Error} - Throws an error if the operation fails
   */
  static async removeContact(userId, contactUserId) {
    try {
      const query = `
        DELETE FROM contacts
        WHERE user_id = $1 AND contact_user_id = $2
          RETURNING contact_id;
      `;

      const result = await sql(query, [userId, contactUserId]);

      return result.length > 0;
    } catch (error) {
      console.error("Error in removeContact:", error.message);
      throw error;
    }
  }

  /**
   * Get all contacts for a user with pagination and optional search
   * @param {string} userId - The ID of the user whose contacts to retrieve
   * @param {number} [page=1] - The page number for pagination
   * @param {number} [limit=50] - The number of contacts per page
   * @param {string} [searchTerm=""] - Optional search term to filter contacts
   * @returns {Promise<Array>} - An array of contact objects with additional information
   * @throws {Error} - Throws an error if the operation fails
   */
  static async getUserContacts(userId, page = 1, limit = 50, searchTerm = "") {
    try {
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          c.contact_id,
          c.contact_user_id,
          u.full_name,
          u.email,
          u.phone_number,
          (
            SELECT COUNT(*) 
            FROM messages 
            WHERE 
              sender_id = c.contact_user_id AND 
              receiver_id = $1 AND 
              read_at IS NULL
          ) as unread_message_count,
          (
            SELECT MAX(sent_at) 
            FROM messages 
            WHERE 
              (sender_id = $1 AND receiver_id = c.contact_user_id) OR
              (sender_id = c.contact_user_id AND receiver_id = $1)
          ) as last_interaction
        FROM contacts c
        JOIN users u ON c.contact_user_id = u.id
        WHERE c.user_id = $1
      `;

      const params = [userId];

      // Add search condition if provided
      if (searchTerm) {
        query += `
          AND (
            u.full_name ILIKE $4 OR
            u.email ILIKE $4 OR
            u.phone_number ILIKE $4
          )
        `;
        params.push(`%${searchTerm}%`);
      }

      // Add sorting and pagination
      query += `
        ORDER BY 
          unread_message_count DESC,
          last_interaction DESC NULLS LAST,
          u.full_name
        LIMIT $2 OFFSET $3;
      `;

      params.push(limit, offset);

      const contacts = await sql(query, params);

      return contacts;
    } catch (error) {
      console.error("Error in getUserContacts:", error.message);
      throw error;
    }
  }

  /**
   * Import contacts from phone numbers
   * @param {string} userId - The ID of the user importing contacts
   * @param {Array<string>} phoneNumbers - An array of phone numbers to import
   * @returns {Promise<Object>} - An object containing import statistics and contact information
   * @throws {Error} - Throws an error if the operation fails
   */
  static async importFromPhoneNumbers(userId, phoneNumbers) {
    try {
      if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
        throw new Error("Phone numbers array is required");
      }

      // Format phone numbers for query
      const formattedNumbers = phoneNumbers.map((num) => {
        // Strip non-numeric characters for comparison
        return num.replace(/\D/g, "");
      });

      // Find registered users with these phone numbers
      const findQuery = `
        SELECT
          id,
          full_name,
          phone_number,
          profile_picture_url
        FROM users
        WHERE REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g') = ANY($1)
          AND id != $2;
      `;

      const foundUsers = await sql(findQuery, [formattedNumbers, userId]);

      // If no users found
      if (foundUsers.length === 0) {
        return {
          added: 0,
          total: 0,
          not_found: phoneNumbers.length,
          contacts: [],
        };
      }

      // Add found users as contacts
      const results = {
        added: 0,
        already_exists: 0,
        total: foundUsers.length,
        not_found: phoneNumbers.length - foundUsers.length,
        contacts: [],
      };

      for (const user of foundUsers) {
        try {
          // Check if already a contact
          const checkQuery = `
            SELECT contact_id FROM contacts
            WHERE user_id = $1 AND contact_user_id = $2;
          `;

          const existingContact = await sql(checkQuery, [userId, user.id]);

          if (existingContact.length > 0) {
            results.already_exists++;
            results.contacts.push({
              ...user,
              already_contact: true,
            });
            continue;
          }

          // Add as contact
          const addQuery = `
            INSERT INTO contacts (user_id, contact_user_id)
            VALUES ($1, $2)
              RETURNING contact_id;
          `;

          const newContact = await sql(addQuery, [userId, user.id]);

          results.added++;
          results.contacts.push({
            ...user,
            contact_id: newContact[0].contact_id,
            already_contact: false,
          });
        } catch (error) {
          console.error(`Error adding contact ${user.id}:`, error.message);
          // Continue with next user
        }
      }

      return results;
    } catch (error) {
      console.error("Error in importFromPhoneNumbers:", error.message);
      throw error;
    }
  }

  /**
   * Get contacts with online status information
   * @param {string} userId - The ID of the user whose contacts to retrieve
   * @param {Array<string>} onlineUserIds - An array of user IDs that are currently online
   * @returns {Promise<Array>} - An array of contact objects with online status
   * @throws {Error} - Throws an error if the operation fails
   */
  static async getContactsWithOnlineStatus(userId, onlineUserIds) {
    try {
      // Get the user's contacts
      const contacts = await this.getUserContacts(userId);

      // Add online status
      return contacts.map((contact) => ({
        ...contact,
        is_online: onlineUserIds.includes(contact.contact_user_id),
      }));
    } catch (error) {
      console.error("Error in getContactsWithOnlineStatus:", error.message);
      throw error;
    }
  }
}

module.exports = Contact;