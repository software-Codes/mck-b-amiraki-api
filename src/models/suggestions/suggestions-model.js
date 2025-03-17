const { sql } = require("../../config/database");
const { notifyAdmins, notifyUser } = require("../../utils/suggestionEmail");
const { v4: uuidv4 } = require("uuid");
const {APIError} = require("../../utils/global-errorHandler");

class SuggestionModel {
  // Validation constants
  static MIN_DESCRIPTION_LENGTH = 20;
  static MAX_DESCRIPTION_LENGTH = 2000;
  static CATEGORIES = [
    "worship",
    "events",
    "facilities",
    "youth",
    "outreach",
    "general",
  ];
  static URGENCY_LEVELS = ["low", "normal", "high", "critical"];
  static STATUSES = [
    "pending",
    "in_progress",
    "reviewed",
    "completed",
    "rejected",
  ];

  /**
   * Create a new suggestion with enhanced features
   * @param {Object} params
   * @param {string} params.userId - Submitting user ID
   * @param {string} params.description - Suggestion content
   * @param {string} [params.category='general'] - Suggestion category
   * @param {string} [params.urgency='normal'] - Urgency level
   * @param {boolean} [params.notifyUser=true] - User notification preference
   * @returns {Promise<Object>} Created suggestion
   */
  static async createSuggestion({
    userId,
    description,
    category = "general",
    urgency = "normal",
    notifyUser = true,
  }) {
    try {
      // Validate inputs
      this.validateDescription(description);
      this.validateCategory(category);
      this.validateUrgency(urgency);

      const suggestionId = uuidv4();

      // Properly structure the transaction
      const result = await sql.transaction((trx) => {
        // Return an array of queries to execute in the transaction
        return [
          // First get user information
          trx`SELECT email, full_name FROM users WHERE id = ${userId}`,

          // Then create the suggestion
          trx`INSERT INTO suggestions (
            id, user_id, description, is_anonymous,
            category, urgency_level, user_notification_preference, status
          ) VALUES (
            ${suggestionId}, ${userId}, ${description}, false,
            ${category}, ${urgency}, ${notifyUser}, 'pending'
          ) RETURNING *`,

          // Insert notification record
          trx`INSERT INTO suggestion_notifications (suggestion_id)
          VALUES (${suggestionId})`,
        ];
      });

      // Process transaction results
      const [userResults, suggestionResults] = result;
      const user = userResults[0];
      const suggestion = suggestionResults[0];

      if (!user || !user.email || user.email.trim() === "") {
        throw new Error(`User with ID ${userId} has no valid email address`);
      }

      // Add user information to the suggestion object for notifications
      suggestion.user_email = user.email;
      suggestion.user_name = user.full_name;

      // Handle notifications asynchronously
      this.handleNotifications(suggestion).catch((error) =>
        console.error("Notification error:", error)
      );

      return suggestion;
    } catch (error) {
      throw this.handleDatabaseError(error, "creating suggestion");
    }
  }

  /**
   * Get user's suggestions with enhanced pagination and filtering
   * @param {string} userId - User ID
   * @param {Object} filters - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @param {string} sortBy - Field to sort by
   * @param {string} sortDirection - Sort direction (asc/desc)
   * @returns {Promise<Object>} User suggestions with pagination
   */


  static async getUserSuggestions(
    userId,
    filters = {},
    page = 1,
    limit = 20,
    sortBy = "created_at",
    sortDirection = "desc"
  ) {
    try {
      // Input validation
      if (!userId) throw new Error("User ID is required");
      if (limit > 100) throw new Error("Maximum limit is 100");
      if (page < 1) throw new Error("Page number must be at least 1");
  
      const offset = (page - 1) * limit;
      const { status, category, urgency, searchTerm } = filters;
  
      // Validate sort parameters
      const validSortFields = ["created_at", "status", "category", "urgency_level"];
      const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "created_at";
      const actualSortDir = sortDirection.toLowerCase() === "asc" ? "ASC" : "DESC";
  
      // Base query
      let query = sql`
        SELECT 
          s.*,
          COUNT(*) OVER() AS total_count,
          u.full_name AS user_name
        FROM suggestions s
        JOIN users u ON s.user_id = u.id
        WHERE 
          s.user_id = ${userId}
          AND s.deleted_at IS NULL
      `;
  
      // Add filters
      if (status) {
        query = sql`${query} AND s.status = ${status}`;
      }
      if (category) {
        query = sql`${query} AND s.category = ${category}`;
      }
      if (urgency) {
        query = sql`${query} AND s.urgency_level = ${urgency}`;
      }
      if (searchTerm) {
        const searchPattern = `%${search}%Term`;
        query = sql`${query} AND s.description ILIKE ${searchPattern}`;
      }
  
      // Add sorting
      query = sql`${query} ORDER BY s.${actualSortBy} ${actualSortDir}`;
  
      // Add pagination
      query = sql`${query} LIMIT ${limit} OFFSET ${offset}`;
  
      // Execute query
      const result = await query;
  
      // Format results
      const formattedSuggestions = result.map(suggestion => {
        return {
          ...suggestion,
          days_since_creation: Math.floor(
            (Date.now() - new Date(suggestion.created_at)) / 86400000
          ),
          has_response: Boolean(suggestion.admin_response),
        };
      });
  
      // Calculate pagination
      const totalCount = result.length > 0 ? parseInt(result[0].total_count) : 0;
      const totalPages = Math.ceil(totalCount / limit);
  
      return {
        suggestions: formattedSuggestions,
        total: totalCount,
        page,
        limit,
        totalPages,
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
          u.full_name AS user_name,
          ua.email AS admin_email,
          ua.full_name AS admin_name
        FROM suggestions s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN users ua ON s.reviewed_by = ua.id
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
  /**
   * Soft delete a suggestion (user)
   */
  static async deleteSuggestion(id, userId) {
    try {
      const result = await sql.transaction((trx) => {
        return [
          // Check if the suggestion exists and belongs to the user
          trx`SELECT * FROM suggestions
              WHERE id = ${id} AND user_id = ${userId}`,

          // Soft delete the suggestion
          trx`UPDATE suggestions
              SET 
                deleted_at = NOW(),
                updated_at = NOW()
              WHERE id = ${id} AND user_id = ${userId}
              RETURNING *`,
        ];
      });

      const [suggestionCheckResults, deletedResults] = result;
      const suggestionCheck = suggestionCheckResults[0];
      const deleted = deletedResults[0];

      if (!suggestionCheck) {
        throw new Error(
          "Unauthorized to delete this suggestion or suggestion not found"
        );
      }

      return deleted;
    } catch (error) {
      throw this.handleDatabaseError(error, "deleting suggestion");
    }
  }

  /**
   * Get suggestions statistics for admin dashboard
   * @returns {Promise<Object>} Suggestion statistics
   */
  static async getSuggestionStats() {
    try {
      const [stats] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total_active,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'in_progress') AS in_progress,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'reviewed') AS reviewed,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'rejected') AS rejected,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_archived = true) AS archived,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND urgency_level = 'critical') AS critical,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND urgency_level = 'high') AS high,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30_days
        FROM suggestions
      `;

      const categoryStats = await sql`
        SELECT 
          category, 
          COUNT(*) AS count
        FROM suggestions
        WHERE deleted_at IS NULL
        GROUP BY category
        ORDER BY count DESC
      `;

      return {
        counts: stats,
        categories: categoryStats,
      };
    } catch (error) {
      throw this.handleDatabaseError(error, "fetching suggestion statistics");
    }
  }

  /**
   * Permanently delete suggestion (admin only)
   * @param {string} id - Suggestion ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Result object
   */
  /**
   * Permanently delete suggestion (admin only)
   */
  static async adminDeleteSuggestion(id, adminId) {
    try {
      const result = await sql.transaction((trx) => {
        return [
          // Verify admin
          trx`SELECT id FROM users 
            WHERE id = ${adminId} AND role IN ('admin', 'super_admin')`,

          // Delete the suggestion
          trx`DELETE FROM suggestions
            WHERE id = ${id}
            RETURNING id`,

          // Clean up related records
          trx`DELETE FROM suggestion_notifications
            WHERE suggestion_id = ${id}`,
        ];
      });

      const [adminResults, suggestionResults] = result;
      const admin = adminResults[0];
      const suggestion = suggestionResults[0];

      if (!admin) {
        throw new Error("Unauthorized: Admin privileges required");
      }

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
      // Get all admin emails
      const admins = await sql`
        SELECT email FROM users WHERE role IN ('admin', 'super_admin')
      `;

      // Notify admins if there are any
      if (admins.length > 0) {
        await notifyAdmins({
          suggestion,
          adminEmails: admins.map((a) => a.email),
          dashboardLink: `${process.env.ADMIN_DASHBOARD_URL}/suggestions/${suggestion.id}`,
        });
      } else {
        console.warn("No admin emails found to notify");
      }

      // Notify user if requested
      if (suggestion.user_notification_preference && suggestion.user_email) {
        if (!suggestion.user_email || suggestion.user_email.trim() === "") {
          throw new Error(
            `User ${suggestion.user_name} has no valid email address`
          );
        }

        await notifyUser({
          userEmail: suggestion.user_email,
          userName: suggestion.user_name,
          suggestionId: suggestion.id,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Notification system error:", error);
      throw new Error("Failed to send notifications");
    }
  }

  // Error handler
  static handleDatabaseError(error, context) {
    console.error(`Database Error (${context}):`, error);
    return new APIError(`Database operation failed: ${context}`, 500, {
      originalError: error,
      code: error.code,
    });
  }
}

module.exports = SuggestionModel;
