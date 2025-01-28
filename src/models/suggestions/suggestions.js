const { sql } = require("../../config/database");
const { notifyAdmins, notifyUser } = require("../../utils/suggestionEmail");

export class SuggestionModel {
  //create suggestion
  static async createSuggestion({
    userId,
    title,
    description,
    isAnonymous = false,
  }) {
    try {
      const result = await sql`
        INSERT INTO suggestions(
          user_id,
          title,
          description,
          is_anonymous
        ) VALUES(
          ${userId},
          ${title},
          ${description},
          ${isAnonymous}
        ) RETURNING *
      `;

      // Get admin emails
      const adminEmails = await sql`
        SELECT email FROM users 
        WHERE role IN ('admin', 'super_admin') AND is_verified = true
      `;

      // Get user details if not anonymous
      let userName = "Anonymous";
      if (!isAnonymous) {
        const user = await sql`
          SELECT full_name FROM users WHERE id = ${userId}
        `;
        userName = user.rows[0]?.full_name || "User";
      }

      // Notify admins
      await notifyAdmins(
        {
          ...result.rows[0],
          userName,
          isAnonymous,
        },
        adminEmails.rows.map((admin) => admin.email)
      );

      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating suggestion: ${error.message}`);
    }
  }
  //update suggestion
  static async updateSuggestion({ id, status, adminResponse, adminId }) {
    try {
      // Validate status
      const validStatuses = ["pending", "reviewed", "implemented", "rejected"];
      if (!validStatuses.includes(status)) {
        throw new Error("Invalid suggestion status");
      }

      const result = await sql`
        UPDATE suggestions
        SET
          status = ${status},
          admin_response = ${adminResponse},
          reviewed_by = ${adminId},
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      // Get user details
      const userDetails = await sql`
        SELECT u.email, u.full_name 
        FROM suggestions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = ${id}
      `;

      if (userDetails.rows.length > 0) {
        const { email, full_name } = userDetails.rows[0];
        await notifyUser(result.rows[0], email, full_name);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating suggestion: ${error.message}`);
    }
  }
  //get user suggestions
  static async getUserSuggestions(userId) {
    try {
      const result = await sql`
        SELECT * FROM suggestions 
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching user suggestions: ${error.message}`);
    }
  }

  static async getAllSuggestions(filter = {}) {
    try {
      const { status, isAnonymous, search } = filter;
      let query = sql`SELECT * FROM suggestions `;

      // Add filters
      const conditions = [];
      if (status) conditions.push(sql`status = ${status}`);
      if (isAnonymous !== undefined)
        conditions.push(sql`is_anonymous = ${isAnonymous}`);
      if (search) conditions.push(sql`title ILIKE ${"%" + search + "%"}`);

      if (conditions.length > 0) {
        query = sql`${query} WHERE ${sql.join(conditions, " AND ")} `;
      }

      query = sql`${query} ORDER BY created_at DESC`;

      const result = await query;
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching suggestions: ${error.message}`);
    }
  }

  static async getSuggestionById(id) {
    try {
      const result = await sql`
        SELECT 
          s.*,
          u.full_name as user_name,
          a.full_name as reviewed_by_name
        FROM suggestions s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN users a ON s.reviewed_by = a.id
        WHERE s.id = ${id}
      `;
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error fetching suggestion: ${error.message}`);
    }
  }
  //delete the suggestion

  static async deleteSuggestion(suggestionId, userId) {
    try {
      // Verify ownership before deletion
      const suggestion = await sql`
        SELECT user_id FROM suggestions WHERE id = ${suggestionId}
      `;

      if (suggestion.rows.length === 0) {
        throw new Error("Suggestion not found");
      }

      if (suggestion.rows[0].user_id !== userId) {
        throw new Error("Unauthorized to delete this suggestion");
      }

      const result = await sql`
        DELETE FROM suggestions 
        WHERE id = ${suggestionId}
        RETURNING *
      `;

      // Notify admins about deletion
      const adminEmails = await sql`
        SELECT email FROM users 
        WHERE role IN ('admin', 'super_admin') AND is_verified = true
      `;

      await this.notifyAdminsOfDeletion(
        result.rows[0],
        adminEmails.rows.map((admin) => admin.email)
      );

      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting suggestion: ${error.message}`);
    }
  }
  //admin response to suggestion sent by a specific user
  static async sendDirectResponse({
    suggestionId,
    adminId,
    message,
    statusUpdate = false,
  }) {
    try {
      // Update suggestion with response
      const result = await sql`
        UPDATE suggestions
        SET
          admin_response = COALESCE(admin_response || '\n\n', '') || ${message},
          ${statusUpdate ? sql`status = 'reviewed',` : sql``}
          reviewed_by = ${adminId},
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = ${suggestionId}
        RETURNING *
      `;

      // Get user details
      const userDetails = await sql`
        SELECT u.email, u.full_name 
        FROM suggestions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = ${suggestionId}
      `;

      if (userDetails.rows.length > 0) {
        const { email, full_name } = userDetails.rows[0];
        await notifyUser(
          {
            ...result.rows[0],
            directMessage: message,
          },
          email,
          full_name
        );
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Error sending response: ${error.message}`);
    }
  }
  //notify admins of deletion
  static async notifyAdminsOfDeletion(suggestion, adminEmails) {
    try {
      const emailPromises = adminEmails.map((email) =>
        sendEmail({
          to: email,
          template: "suggestionDeleted",
          data: {
            ...suggestion,
            deletedAt: new Date().toISOString(),
          },
        })
      );

      await Promise.all(emailPromises);
      return true;
    } catch (error) {
      console.error("Error notifying admins of deletion:", error);
      return false;
    }
  }
}
