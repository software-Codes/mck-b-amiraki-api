const { sql } = require("../../config/database");
const {
  sendEmail,
  notifyAdmins,
  notifyUser,
} = require("../../utils/suggestionEmail");

class SuggestionModel {
  // Validation constants
  static MIN_TITLE_LENGTH = 5;
  static MAX_TITLE_LENGTH = 255;
  static MIN_DESCRIPTION_LENGTH = 20;
  static MAX_DESCRIPTION_LENGTH = 2000;

  /**
   * Create a new suggestion
   * @param {Object} params - Input parameters
   * @param {string} params.userId - UUID of submitting user
   * @param {string} params.title - Suggestion title
   * @param {string} params.description - Detailed description
   * @param {boolean} [params.isAnonymous=false] - Anonymous submission flag
   * @returns {Promise<Object>} Created suggestion
   */
  static async createSuggestion({
    userId,
    title,
    description,
    isAnonymous = false,
  }) {
    try {
      // Validate input lengths
      this.validateTitle(title);
      this.validateDescription(description);

      const result = await sql`
        INSERT INTO suggestions(
          user_id, title, description, is_anonymous
        ) VALUES(
          ${userId}, ${title}, ${description}, ${isAnonymous}
        ) RETURNING *
      `;

      // Fire-and-forget email notifications
      this.handlePostCreationEmails(result.rows[0], userId, isAnonymous).catch(
        (error) => console.error("Email notification failed:", error)
      );

      return result.rows[0];
    } catch (error) {
      throw this.handleDatabaseError(error, "creating suggestion");
    }
  }

  /**
   * Update suggestion status/admin response
   * @param {Object} params - Update parameters
   * @param {string} params.id - Suggestion UUID
   * @param {string} params.status - New status
   * @param {string} params.adminResponse - Admin comment
   * @param {string} params.adminId - Admin UUID
   * @returns {Promise<Object>} Updated suggestion
   */
  static async updateSuggestion({ id, status, adminResponse, adminId }) {
    try {
      this.validateStatus(status);

      const result = await sql.begin(async (sql) => {
        // Lock row for update
        const suggestion = await sql`
          SELECT * FROM suggestions 
          WHERE id = ${id} FOR UPDATE
        `;
        if (!suggestion.rows.length) throw new Error("Suggestion not found");

        return sql`
          UPDATE suggestions SET
            status = ${status},
            admin_response = ${adminResponse},
            reviewed_by = ${adminId},
            reviewed_at = NOW(),
            updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;
      });

      this.handlePostUpdateEmails(result.rows[0]).catch((error) =>
        console.error("Update notification failed:", error)
      );

      return result.rows[0];
    } catch (error) {
      throw this.handleDatabaseError(error, "updating suggestion");
    }
  }

  /**
   * Get paginated user suggestions
   * @param {string} userId - UUID of the user
   * @param {number} [page=1] - Pagination page
   * @param {number} [limit=20] - Items per page
   * @returns {Promise<Object>} { suggestions, total }
   */
  static async getUserSuggestions(userId, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;

      const result = await sql`
          WITH user_suggestions AS (
            SELECT * FROM suggestions 
            WHERE user_id = ${userId}
          )
          SELECT 
            (SELECT COUNT(*) FROM user_suggestions) AS total,
            us.* 
          FROM user_suggestions us
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;

      return {
        suggestions: result.rows,
        total: result.rows[0]?.total || 0,
      };
    } catch (error) {
      throw this.handleDatabaseError(error, "fetching user suggestions");
    }
  }

  /**
   * Get single suggestion with detailed information
   * @param {string} id - Suggestion UUID
   * @returns {Promise<Object>} Suggestion details
   */
  static async getSuggestionById(id) {
    try {
      const result = await sql`
        SELECT 
          s.*,
          u.full_name as user_name,
          a.full_name as reviewed_by_name,
          u.email as user_email
        FROM suggestions s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN users a ON s.reviewed_by = a.id
        WHERE s.id = ${id}
      `;

      if (result.rows.length === 0) {
        throw new Error("Suggestion not found");
      }

      return result.rows[0];
    } catch (error) {
      throw this.handleDatabaseError(error, "fetching suggestion");
    }
  }

  /**
   * Delete a suggestion with ownership verification
   * @param {string} suggestionId - Suggestion UUID
   * @param {string} userId - User UUID requesting deletion
   * @returns {Promise<Object>} Deleted suggestion
   */
  static async deleteSuggestion(suggestionId, userId) {
    try {
      return await sql.begin(async (sql) => {
        // Verify ownership
        const suggestion = await sql`
          SELECT user_id FROM suggestions 
          WHERE id = ${suggestionId} 
          FOR UPDATE
        `;

        if (suggestion.rows.length === 0) {
          throw new Error("Suggestion not found");
        }

        if (suggestion.rows[0].user_id !== userId) {
          throw new Error("Unauthorized to delete this suggestion");
        }

        // Soft delete
        const result = await sql`
          UPDATE suggestions
          SET deleted_at = NOW()
          WHERE id = ${suggestionId}
          RETURNING *
        `;

        // Notify admins asynchronously
        this.notifyAdminsOfDeletion(result.rows[0]).catch((error) =>
          console.error("Deletion notification failed:", error)
        );

        return result.rows[0];
      });
    } catch (error) {
      throw this.handleDatabaseError(error, "deleting suggestion");
    }
  }
  /**
   * Send direct response to user (admin-only)
   * @param {Object} params - Update parameters
   * @param {string} params.suggestionId - Suggestion UUID
   * @param {string} params.adminId - Admin UUID
   * @param {string} params.message - Response message
   * @param {boolean} [params.statusUpdate] - Whether to mark as reviewed
   * @returns {Promise<Object>} Updated suggestion
   */
  static async sendDirectResponse({
    suggestionId,
    adminId,
    message,
    statusUpdate = false,
  }) {
    try {
      return await sql.begin(async (sql) => {
        // Verify admin role
        const admin = await sql`
            SELECT role FROM users 
            WHERE id = ${adminId} AND role IN ('admin', 'super_admin')
          `;

        if (admin.rows.length === 0) {
          throw new Error("Unauthorized: Admin privileges required");
        }

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

        await this.handlePostUpdateEmails(result.rows[0]);
        return result.rows[0];
      });
    } catch (error) {
      throw this.handleDatabaseError(error, "sending direct response");
    }
  }

  /**
   * Notify admins about suggestion deletion
   * @param {Object} suggestion - Deleted suggestion
   */
  static async notifyAdminsOfDeletion(suggestion) {
    try {
      const admins = await sql`
        SELECT email FROM users 
        WHERE role IN ('admin', 'super_admin') AND is_verified = true
      `;

      await notifyAdmins(
        {
          ...suggestion,
          deletedAt: new Date().toISOString(),
          userName: suggestion.is_anonymous
            ? "Anonymous User"
            : await this.getUserName(suggestion.user_id),
        },
        admins.rows.map((a) => a.email),
        "suggestionDeleted"
      );
    } catch (error) {
      console.error("Failed to notify admins of deletion:", error);
    }
  }

  /**
   * Get paginated suggestions with filters
   * @param {Object} [filters] - Filter options
   * @param {string} [filters.status] - Filter by status
   * @param {boolean} [filters.isAnonymous] - Filter anonymous
   * @param {string} [filters.search] - Search in title/description
   * @param {number} [page=1] - Pagination page
   * @param {number} [limit=20] - Items per page
   * @returns {Promise<Object>} { suggestions, total }
   */
  static async getAllSuggestions(filters = {}, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      const { status, isAnonymous, search } = filters;

      const query = sql`
        WITH filtered AS (
          SELECT *
          FROM suggestions
          WHERE 1=1
            ${status ? sql`AND status = ${status}` : sql``}
            ${
              isAnonymous !== undefined
                ? sql`AND is_anonymous = ${isAnonymous}`
                : sql``
            }
            ${
              search
                ? sql`AND (title ILIKE ${`%${search}%`} OR description ILIKE ${`%${search}%`})`
                : sql``
            }
        )
        SELECT 
          (SELECT COUNT(*) FROM filtered) AS total,
          f.* 
        FROM filtered f
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const result = await query;
      return {
        suggestions: result.rows,
        total: result.rows[0]?.total || 0,
      };
    } catch (error) {
      throw this.handleDatabaseError(error, "fetching suggestions");
    }
  }

  // ---------------------- Helper Methods ----------------------

  static async handlePostCreationEmails(suggestion, userId, isAnonymous) {
    const [admins, user] = await Promise.all([
      sql`SELECT email FROM users WHERE role IN ('admin', 'super_admin')`,
      isAnonymous
        ? null
        : sql`SELECT full_name, email FROM users WHERE id = ${userId}`,
    ]);

    await notifyAdmins(
      {
        ...suggestion,
        userName: user?.rows[0]?.full_name || "Anonymous User",
        userEmail: user?.rows[0]?.email,
      },
      admins.rows.map((a) => a.email)
    );
  }
  /** Get user name for notifications */
  static async getUserName(userId) {
    const user = await sql`
      SELECT full_name FROM users WHERE id = ${userId}
    `;
    return user.rows[0]?.full_name || "User";
  }
  static async handlePostUpdateEmails(updatedSuggestion) {
    const userDetails = await sql`
      SELECT u.email, u.full_name 
      FROM suggestions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ${updatedSuggestion.id}
    `;

    if (userDetails.rows.length) {
      await notifyUser(
        updatedSuggestion,
        userDetails.rows[0].email,
        userDetails.rows[0].full_name
      );
    }
  }

  static validateTitle(title) {
    if (!title || title.length < this.MIN_TITLE_LENGTH) {
      throw new Error(
        `Title must be at least ${this.MIN_TITLE_LENGTH} characters`
      );
    }
    if (title.length > this.MAX_TITLE_LENGTH) {
      throw new Error(
        `Title cannot exceed ${this.MAX_TITLE_LENGTH} characters`
      );
    }
  }

  static validateDescription(description) {
    if (!description || description.length < this.MIN_DESCRIPTION_LENGTH) {
      throw new Error(
        `Description must be at least ${this.MIN_DESCRIPTION_LENGTH} characters`
      );
    }
    if (description.length > this.MAX_DESCRIPTION_LENGTH) {
      throw new Error(
        `Description cannot exceed ${this.MAX_DESCRIPTION_LENGTH} characters`
      );
    }
  }

  static validateStatus(status) {
    const validStatuses = new Set([
      "pending",
      "reviewed",
      "implemented",
      "rejected",
    ]);
    if (!validStatuses.has(status)) {
      throw new Error(
        `Invalid status: ${status}. Valid values: ${[...validStatuses].join(
          ", "
        )}`
      );
    }
  }

  static handleDatabaseError(error, context) {
    console.error(`Database error while ${context}:`, error);
    return new Error(
      process.env.NODE_ENV === "production"
        ? `Database operation failed`
        : `Database error during ${context}: ${error.message}`
    );
  }
}

module.exports = { SuggestionModel };
