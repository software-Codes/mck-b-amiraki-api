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
      
      const result = await sql.transaction(async (tx) => {
        // Main suggestion insertion
        const [suggestion] = await tx`
          INSERT INTO suggestions (
            id, user_id, description, is_anonymous,
            category, urgency_level, user_notification_preference
          ) VALUES (
            ${suggestionId}, ${userId}, ${description}, ${isAnonymous},
            ${category}, ${urgency}, ${notifyUser}
          ) RETURNING *
        `;
  
        // Store notification history
        await tx`
          INSERT INTO suggestion_notifications (suggestion_id)
          VALUES (${suggestionId})
        `;
  
        return suggestion;
      });
  
      // Async notifications
      this.handleNotifications(result).catch(error => 
        console.error("Notification error:", error)
      );
  
      return result;
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
      return await sql.transaction(async (tx) => {
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

      // Notify admins
      await notifyAdmins({
        suggestion,
        adminEmails: admins.map(a => a.email),
        dashboardLink: `${process.env.ADMIN_DASHBOARD_URL}/suggestions/${suggestion.id}`
      });

      // Notify user if requested and not anonymous
      if (suggestion.user_notification_preference && user) {
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
    }
  }

  // Error handler
  static handleDatabaseError(error, context) {
    console.error(`Database Error (${context}):`, error);
    return new Error(`Failed to complete operation: ${error.message}`);
  }
}

module.exports = SuggestionModel;