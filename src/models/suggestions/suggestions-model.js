const { sql } = require("../../config/database");
const { notifyAdmins, notifyUser } = require("../../utils/suggestionEmail");
const { v4: uuidv4 } = require('uuid');

class SuggestionModel {
  // Validation constants
  static MIN_DESCRIPTION_LENGTH = 20;
  static MAX_DESCRIPTION_LENGTH = 2000;
  static CATEGORIES = ['worship', 'events', 'facilities', 'youth', 'outreach', 'general'];
  static URGENCY_LEVELS = ['low', 'normal', 'high', 'critical'];

  /**
   * Create a new suggestion with enhanced features
   * @param {Object} params
   * @param {string} params.userId - Submitting user ID
   * @param {string} params.description - Suggestion content
   * @param {boolean} [params.isAnonymous=false] - Anonymous submission
   * @param {string} [params.category='general'] - Suggestion category
   * @param {string} [params.urgency='normal'] - Urgency level
   * @param {boolean} [params.notifyUser=true] - User notification preference
   * @returns {Promise<Object>} Created suggestion
   */
  static async createSuggestion({
    userId,
    description,
    isAnonymous = false,
    category = 'general',
    urgency = 'normal',
    notifyUser = true
  }) {
    try {
      // Validate inputs
      this.validateDescription(description);
      this.validateCategory(category);
      this.validateUrgency(urgency);
  
      const suggestionId = uuidv4();
      
      // Let's try the correct transaction syntax for your library
      const suggestion = await sql`
        INSERT INTO suggestions (
          id, user_id, description, is_anonymous,
          category, urgency_level, user_notification_preference
        ) VALUES (
          ${suggestionId}, ${userId}, ${description}, ${isAnonymous},
          ${category}, ${urgency}, ${notifyUser}
        ) RETURNING *
      `;
  
      // After successful suggestion creation, insert notification record
      await sql`
        INSERT INTO suggestion_notifications (suggestion_id)
        VALUES (${suggestionId})
      `;
  
      // Async notifications
      this.handleNotifications(suggestion[0]).catch(error => 
        console.error("Notification error:", error)
      );
  
      return suggestion[0];
    } catch (error) {
      throw this.handleDatabaseError(error, "creating suggestion");
    }
  }
  /**
   * Get suggestions for admin dashboard with filters
   * @param {Object} filters - Filter criteria
   * @param {number} page - Pagination page
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Filtered suggestions
   */
  static async getAdminDashboardSuggestions(filters = {}, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      const { status, category, urgency, isArchived = false } = filters;

      const query = sql`
        SELECT 
          s.*,
          u.email AS user_email,
          u.full_name AS user_name,
          COUNT(*) OVER() AS total_count
        FROM suggestions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.deleted_at IS NULL
          AND s.is_archived = ${isArchived}
          ${status ? sql`AND s.status = ${status}` : sql``}
          ${category ? sql`AND s.category = ${category}` : sql``}
          ${urgency ? sql`AND s.urgency_level = ${urgency}` : sql``}
        ORDER BY 
          CASE s.urgency_level
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            ELSE 4
          END,
          s.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const result = await query;
      return {
        suggestions: result,
        total: result[0]?.total_count || 0,
        page,
        totalPages: Math.ceil((result[0]?.total_count || 0) / limit)
      };
    } catch (error) {
      throw this.handleDatabaseError(error, "fetching dashboard suggestions");
    }
  }

  /**
   * Archive suggestion (admin only)
   * @param {string} suggestionId 
   * @param {string} adminId 
   * @returns {Promise<Object>} Archived suggestion
   */
  static async archiveSuggestion(suggestionId, adminId) {
    try {
      // Fixed transaction implementation
      return await sql.begin(async (tx) => {
        // Verify admin privileges
        const [admin] = await tx`
          SELECT id FROM users 
          WHERE id = ${adminId} AND role IN ('admin', 'super_admin')
        `;
        if (!admin) throw new Error("Admin not found");
  
        const [suggestion] = await tx`
          UPDATE suggestions
          SET is_archived = true, updated_at = NOW()
          WHERE id = ${suggestionId}
          RETURNING *
        `;
  
        // Add admin note
        await tx`
          UPDATE suggestions
          SET admin_notes = jsonb_set(
            COALESCE(admin_notes, '[]'::jsonb),
            '{archived_by}', ${adminId}::jsonb
          )
          WHERE id = ${suggestionId}
        `;
  
        return suggestion;
      });
    } catch (error) {
      throw this.handleDatabaseError(error, "archiving suggestion");
    }
  }

  /**
   * Update suggestion (admin only)
   * @param {Object} params
   * @param {string} params.id - Suggestion ID
   * @param {string} params.status - New status
   * @param {string} params.adminResponse - Admin response
   * @param {string} params.adminId - Admin ID
   * @returns {Promise<Object>} Updated suggestion
   */
  static async updateSuggestion({ id, status, adminResponse, adminId }) {
    try {
      return await sql.begin(async (tx) => {
        const [suggestion] = await tx`
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

        if (!suggestion) {
          throw new Error("Suggestion not found");
        }

        // If user wants notifications and suggestion isn't anonymous
        if (suggestion.user_notification_preference && !suggestion.is_anonymous) {
          const [user] = await tx`
            SELECT email, full_name 
            FROM users 
            WHERE id = ${suggestion.user_id}
          `;

          if (user) {
            // Queue notification in a real system you might use a job queue here
            this.handleStatusUpdateNotification(suggestion, user).catch(err => 
              console.error("Failed to send status update notification:", err)
            );
          }
        }

        return suggestion;
      });
    } catch (error) {
      throw this.handleDatabaseError(error, "updating suggestion");
    }
  }

  /**
   * Get user's suggestions
   * @param {string} userId - User ID
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} User suggestions with pagination
   */
  static async getUserSuggestions(userId, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      
      const result = await sql`
        SELECT 
          s.*,
          COUNT(*) OVER() AS total_count
        FROM suggestions s
        WHERE s.user_id = ${userId}
          AND s.deleted_at IS NULL
        ORDER BY s.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return {
        suggestions: result,
        total: result[0]?.total_count || 0
      };
    } catch (error) {
      throw this.handleDatabaseError(error, "fetching user suggestions");
    }
  }

  /**
   * Get suggestion by ID
   * @param {string} id - Suggestion ID
   * @returns {Promise<Object>} Suggestion
   */
  static async getSuggestionById(id) {
    try {
      const [suggestion] = await sql`
        SELECT 
          s.*,
          u.email AS user_email,
          u.full_name AS user_name
        FROM suggestions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.id = ${id}
          AND s.deleted_at IS NULL
      `;

      return suggestion;
    } catch (error) {
      throw this.handleDatabaseError(error, "fetching suggestion");
    }
  }

  /**
   * Soft delete a suggestion (user)
   * @param {string} id - Suggestion ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Deleted suggestion
   */
  static async deleteSuggestion(id, userId) {
    try {
      const [suggestion] = await sql`
        SELECT * FROM suggestions
        WHERE id = ${id} AND user_id = ${userId}
      `;

      if (!suggestion) {
        throw new Error("Unauthorized to delete this suggestion");
      }

      const [deleted] = await sql`
        UPDATE suggestions
        SET deleted_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *
      `;

      return deleted;
    } catch (error) {
      throw this.handleDatabaseError(error, "deleting suggestion");
    }
  }

  /**
   * Send direct response to suggestion
   * @param {Object} params
   * @param {string} params.suggestionId - Suggestion ID
   * @param {string} params.adminId - Admin ID
   * @param {string} params.message - Response message
   * @param {boolean} params.statusUpdate - Whether to update status
   * @returns {Promise<Object>} Updated suggestion
   */
  static async sendDirectResponse({ suggestionId, adminId, message, statusUpdate }) {
    try {
      return await sql.begin(async (tx) => {
        // Get suggestion with user info
        const [suggestion] = await tx`
          SELECT s.*, u.email, u.full_name
          FROM suggestions s
          LEFT JOIN users u ON s.user_id = u.id
          WHERE s.id = ${suggestionId}
        `;

        if (!suggestion) {
          throw new Error("Suggestion not found");
        }

        // Update suggestion if status update requested
        let updatedSuggestion = suggestion;
        if (statusUpdate) {
          [updatedSuggestion] = await tx`
            UPDATE suggestions
            SET 
              status = 'reviewed',
              reviewed_by = ${adminId},
              reviewed_at = NOW(),
              updated_at = NOW()
            WHERE id = ${suggestionId}
            RETURNING *
          `;
        }

        // Send response email to user if not anonymous
        if (!suggestion.is_anonymous && suggestion.user_notification_preference) {
          this.sendUserResponse({
            userEmail: suggestion.email,
            userName: suggestion.full_name,
            message,
            suggestionId
          }).catch(err => console.error("Failed to send user response:", err));
        }

        return updatedSuggestion;
      });
    } catch (error) {
      throw this.handleDatabaseError(error, "sending direct response");
    }
  }

  /**
   * Get all suggestions (admin view)
   * @param {Object} filters - Filter criteria
   * @param {number} page - Pagination page
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Filtered suggestions
   */
  static async getAllSuggestions(filters = {}, page = 1, limit = 20) {
    try {
      return await this.getAdminDashboardSuggestions(filters, page, limit);
    } catch (error) {
      throw this.handleDatabaseError(error, "fetching all suggestions");
    }
  }

  /**
   * Permanently delete suggestion (admin only)
   * @param {string} id - Suggestion ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Result object
   */
  static async adminDeleteSuggestion(id, adminId) {
    try {
      // Verify admin
      const [admin] = await sql`
        SELECT id FROM users 
        WHERE id = ${adminId} AND role IN ('admin', 'super_admin')
      `;
      
      if (!admin) {
        throw new Error("Unauthorized: Admin privileges required");
      }

      const [suggestion] = await sql`
        DELETE FROM suggestions
        WHERE id = ${id}
        RETURNING id
      `;

      if (!suggestion) {
        throw new Error("Suggestion not found");
      }

      return { id: suggestion.id };
    } catch (error) {
      throw this.handleDatabaseError(error, "permanently deleting suggestion");
    }
  }

  // Validation methods
  static validateDescription(description) {
    if (!description || description.length < this.MIN_DESCRIPTION_LENGTH) {
      throw new Error(`Description must be at least ${this.MIN_DESCRIPTION_LENGTH} characters`);
    }
    if (description.length > this.MAX_DESCRIPTION_LENGTH) {
      throw new Error(`Description cannot exceed ${this.MAX_DESCRIPTION_LENGTH} characters`);
    }
  }

  static validateCategory(category) {
    if (!this.CATEGORIES.includes(category)) {
      throw new Error(`Invalid category: ${category}`);
    }
  }

  static validateUrgency(urgency) {
    if (!this.URGENCY_LEVELS.includes(urgency)) {
      throw new Error(`Invalid urgency level: ${urgency}`);
    }
  }

  // Notification handler
  static async handleNotifications(suggestion) {
    try {
      const [admins, user] = await Promise.all([
        sql`SELECT email FROM users WHERE role IN ('admin', 'super_admin')`,
        suggestion.is_anonymous 
          ? null 
          : sql`SELECT email, full_name FROM users WHERE id = ${suggestion.user_id}`
      ]);
  
      // Notify admins if there are any
      if (admins.length > 0) {
        await notifyAdmins({
          suggestion,
          adminEmails: admins.map(a => a.email),
          dashboardLink: `${process.env.ADMIN_DASHBOARD_URL}/suggestions/${suggestion.id}`
        });
      } else {
        console.warn("No admin emails found to notify");
      }
  
      // Notify user if requested and not anonymous
      if (suggestion.user_notification_preference && user) {
        if (!user.email || user.email.trim() === '') {
          console.warn(`User ${user.full_name} has no valid email address`);
          return;
        }
  
        await notifyUser({
          userEmail: user.email,
          userName: user.full_name,
          suggestionId: suggestion.id,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Notification system error:", error);
      // Consider adding retry logic here
      throw new Error("Failed to send notifications");
      
    }
  }
  // Status update notification handler
  static async handleStatusUpdateNotification(suggestion, user) {
    try {
      // This would be implemented in your email utility
      await notifyUser({
        userEmail: user.email,
        userName: user.full_name,
        suggestionId: suggestion.id,
        status: suggestion.status,
        adminResponse: suggestion.admin_response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Status update notification error:", error);
    }
  }

  // User response sender
  static async sendUserResponse({ userEmail, userName, message, suggestionId }) {
    try {
      // This would be implemented in your email utility
      await notifyUser({
        userEmail,
        userName,
        suggestionId,
        adminResponse: message,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("User response email error:", error);
    }
  }

  // Error handler
  static handleDatabaseError(error, context) {
    console.error(`Database Error (${context}):`, error);
    return new Error(`Failed to complete operation: ${error.message}`);
  }
}

module.exports = SuggestionModel;