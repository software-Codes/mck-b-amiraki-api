const { sql } = require("../../config/database");
const { notifyAdmins, notifyUser } = require("../../utils/suggestionEmail");
const { v4: uuidv4 } = require('uuid');

class SuggestionModel {
  // Validation constants
  static MIN_DESCRIPTION_LENGTH = 20;
  static MAX_DESCRIPTION_LENGTH = 2000;
  static CATEGORIES = ['worship', 'events', 'facilities', 'youth', 'outreach', 'general'];
  static URGENCY_LEVELS = ['low', 'normal', 'high', 'critical'];
  static STATUSES = ['pending', 'in_progress', 'reviewed', 'completed', 'rejected'];

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
      
      // Properly structure the transaction
      const result = await sql.transaction(trx => {
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
          VALUES (${suggestionId})`
        ];
      });
      
      // Process transaction results
      const [userResults, suggestionResults] = result;
      const user = userResults[0];
      const suggestion = suggestionResults[0];
      
      if (!user || !user.email || user.email.trim() === '') {
        throw new Error(`User with ID ${userId} has no valid email address`);
      }
  
      // Add user information to the suggestion object for notifications
      suggestion.user_email = user.email;
      suggestion.user_name = user.full_name;
  
      // Handle notifications asynchronously
      this.handleNotifications(suggestion).catch(error => 
        console.error("Notification error:", error)
      );
  
      return suggestion;
    } catch (error) {
      throw this.handleDatabaseError(error, "creating suggestion");
    }
  }
  /**
   * Get suggestions for admin dashboard with enhanced filtering and sorting
   * @param {Object} filters - Filter criteria
   * @param {number} page - Pagination page
   * @param {number} limit - Items per page
   * @param {string} sortBy - Field to sort by
   * @param {string} sortDirection - asc or desc
   * @returns {Promise<Object>} Filtered suggestions
   */
  static async getAdminDashboardSuggestions(
    filters = {}, 
    page = 1, 
    limit = 20, 
    sortBy = 'created_at', 
    sortDirection = 'desc'
  ) {
    try {
      const offset = (page - 1) * limit;
      const { status, category, urgency, isArchived = false, searchTerm } = filters;

      // Validate sort parameters
      const validSortFields = ['created_at', 'urgency_level', 'category', 'status'];
      const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
      const actualSortDir = sortDirection.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      // Build query with proper SQL injection protection
      let query = sql`
        SELECT 
          s.*,
          u.email AS user_email,
          u.full_name AS user_name,
          COUNT(*) OVER() AS total_count
        FROM suggestions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.deleted_at IS NULL
          AND s.is_archived = ${isArchived}
      `;

      // Apply filters conditionally
      if (status) query = query.append(sql` AND s.status = ${status}`);
      if (category) query = query.append(sql` AND s.category = ${category}`);
      if (urgency) query = query.append(sql` AND s.urgency_level = ${urgency}`);
      
      // Add search capability
      if (searchTerm) {
        query = query.append(sql`
          AND (
            s.description ILIKE ${'%' + searchTerm + '%'} OR
            u.full_name ILIKE ${'%' + searchTerm + '%'} OR
            u.email ILIKE ${'%' + searchTerm + '%'}
          )
        `);
      }

      // Add custom sorting
      if (actualSortBy === 'urgency_level') {
        // Custom urgency sort order
        query = query.append(sql`
          ORDER BY 
            CASE s.urgency_level
              WHEN 'critical' THEN 1
              WHEN 'high' THEN 2
              WHEN 'normal' THEN 3
              WHEN 'low' THEN 4
            END
        `);
        if (actualSortDir === 'DESC') {
          query = query.append(sql` DESC`);
        }
        query = query.append(sql`, s.created_at DESC`);
      } else {
        // Standard sorting
        if (actualSortBy === 'created_at') {
          query = query.append(sql` ORDER BY s.created_at`);
        } else {
          query = query.append(sql` ORDER BY s.${sql(actualSortBy)}`);
        }
        query = query.append(actualSortDir === 'ASC' ? sql` ASC` : sql` DESC`);
      }

      // Add pagination
      query = query.append(sql` LIMIT ${limit} OFFSET ${offset}`);

      const result = await query;
      
      return {
        suggestions: result,
        total: result.length > 0 ? parseInt(result[0].total_count) : 0,
        page,
        totalPages: Math.ceil((result.length > 0 ? parseInt(result[0].total_count) : 0) / limit)
      };
    } catch (error) {
      throw this.handleDatabaseError(error, "fetching dashboard suggestions");
    }
  }

  /**
   * Archive suggestion (admin only)
   * @param {string} suggestionId 
   * @param {string} adminId 
   * @param {string} archiveReason 
   * @returns {Promise<Object>} Archived suggestion
   */
 /**
   * Archive suggestion (admin only)
   */
 static async archiveSuggestion(suggestionId, adminId, archiveReason = '') {
  try {
    const result = await sql.transaction(trx => {
      return [
        // Verify admin privileges
        trx`SELECT id FROM users 
            WHERE id = ${adminId} AND role IN ('admin', 'super_admin')`,
        
        // Check if suggestion exists
        trx`SELECT * FROM suggestions WHERE id = ${suggestionId}`,
        
        // Update suggestion to archived
        trx`UPDATE suggestions
            SET 
              is_archived = true, 
              updated_at = NOW(),
              archived_at = NOW(),
              archived_by = ${adminId},
              archived_reason = ${archiveReason}
            WHERE id = ${suggestionId}
            RETURNING *`
      ];
    });
    
    const [adminResults, existingSuggestionResults, suggestionResults] = result;
    const admin = adminResults[0];
    const existingSuggestion = existingSuggestionResults[0];
    const suggestion = suggestionResults[0];
    
    if (!admin) {
      throw new Error("Unauthorized: Admin privileges required");
    }
    
    if (!existingSuggestion) {
      throw new Error("Suggestion not found");
    }
    
    return suggestion;
  } catch (error) {
    throw this.handleDatabaseError(error, "archiving suggestion");
  }
}

  /**
   * Unarchive a suggestion (admin only)
   * @param {string} suggestionId 
   * @param {string} adminId 
   * @returns {Promise<Object>} Unarchived suggestion
   */
   /**
   * Unarchive a suggestion (admin only)
   */
   static async unarchiveSuggestion(suggestionId, adminId) {
    try {
      const result = await sql.transaction(trx => {
        return [
          // Verify admin privileges
          trx`SELECT id FROM users 
              WHERE id = ${adminId} AND role IN ('admin', 'super_admin')`,
          
          // Update suggestion
          trx`UPDATE suggestions
              SET 
                is_archived = false, 
                updated_at = NOW(),
                archived_at = NULL,
                archived_by = NULL,
                archived_reason = NULL
              WHERE id = ${suggestionId}
              RETURNING *`
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
      
      return suggestion;
    } catch (error) {
      throw this.handleDatabaseError(error, "unarchiving suggestion");
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
 /**
   * Update suggestion (admin only)
   */
 static async updateSuggestion({ id, status, adminResponse, adminId }) {
  try {
    if (status && !this.STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    
    const result = await sql.transaction(trx => {
      return [
        // Verify admin privileges
        trx`SELECT id FROM users 
            WHERE id = ${adminId} AND role IN ('admin', 'super_admin')`,
        
        // Get existing suggestion with user info for notification
        trx`SELECT s.*, u.email, u.full_name
            FROM suggestions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.id = ${id}`,
        
        // Update suggestion
        trx`UPDATE suggestions
            SET 
              status = COALESCE(${status}, status),
              admin_response = COALESCE(${adminResponse}, admin_response),
              reviewed_by = ${adminId},
              reviewed_at = NOW(),
              updated_at = NOW()
            WHERE id = ${id}
            RETURNING *`
      ];
    });
    
    const [adminResults, existingSuggestionResults, suggestionResults] = result;
    const admin = adminResults[0];
    const existingSuggestion = existingSuggestionResults[0];
    const suggestion = suggestionResults[0];
    
    if (!admin) {
      throw new Error("Unauthorized: Admin privileges required");
    }
    
    if (!existingSuggestion) {
      throw new Error("Suggestion not found");
    }
    
    // If user wants notifications, send email
    if (suggestion.user_notification_preference) {
      // Queue notification asynchronously
      this.handleStatusUpdateNotification({
        ...suggestion,
        user_email: existingSuggestion.email,
        user_name: existingSuggestion.full_name
      }).catch(err => 
        console.error("Failed to send status update notification:", err)
      );
    }
    
    return suggestion;
  } catch (error) {
    throw this.handleDatabaseError(error, "updating suggestion");
  }
}

  /**
   * Get user's suggestions with enhanced pagination
   * @param {string} userId - User ID
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @param {string} sortBy - Field to sort by
   * @param {string} sortDirection - Sort direction (asc/desc)
   * @returns {Promise<Object>} User suggestions with pagination
   */
  static async getUserSuggestions(
    userId, 
    page = 1, 
    limit = 20,
    sortBy = 'created_at',
    sortDirection = 'desc'
  ) {
    try {
      const offset = (page - 1) * limit;
      
      // Validate sort fields
      const validSortFields = ['created_at', 'status', 'category', 'urgency_level'];
      const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
      const actualSortDir = sortDirection.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      
      let query = sql`
        SELECT 
          s.*,
          COUNT(*) OVER() AS total_count
        FROM suggestions s
        WHERE s.user_id = ${userId}
          AND s.deleted_at IS NULL
      `;
      
      // Add sorting
      if (actualSortBy === 'created_at') {
        query = query.append(sql` ORDER BY s.created_at`);
      } else {
        query = query.append(sql` ORDER BY s.${sql(actualSortBy)}`);
      }
      
      query = query.append(actualSortDir === 'ASC' ? sql` ASC` : sql` DESC`);
      
      // Add pagination
      query = query.append(sql` LIMIT ${limit} OFFSET ${offset}`);
      
      const result = await query;

      return {
        suggestions: result,
        total: result.length > 0 ? parseInt(result[0].total_count) : 0,
        page,
        limit,
        totalPages: Math.ceil((result.length > 0 ? parseInt(result[0].total_count) : 0) / limit)
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
      const result = await sql.transaction(trx => {
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
              RETURNING *`
        ];
      });
      
      const [suggestionCheckResults, deletedResults] = result;
      const suggestionCheck = suggestionCheckResults[0];
      const deleted = deletedResults[0];
      
      if (!suggestionCheck) {
        throw new Error("Unauthorized to delete this suggestion or suggestion not found");
      }
      
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
/**
   * Send direct response to suggestion
   */
static async sendDirectResponse({ suggestionId, adminId, message, statusUpdate }) {
  try {
    // First query set
    const initialResult = await sql.transaction(trx => {
      return [
        // Verify admin privileges
        trx`SELECT id FROM users 
            WHERE id = ${adminId} AND role IN ('admin', 'super_admin')`,
        
        // Get suggestion with user info
        trx`SELECT s.*, u.email, u.full_name
            FROM suggestions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.id = ${suggestionId}`
      ];
    });
    
    const [adminResults, suggestionResults] = initialResult;
    const admin = adminResults[0];
    const suggestion = suggestionResults[0];
    
    if (!admin) {
      throw new Error("Unauthorized: Admin privileges required");
    }
    
    if (!suggestion) {
      throw new Error("Suggestion not found");
    }
    
    // Second transaction for update based on conditional logic
    let updatedSuggestion;
    if (statusUpdate) {
      const updateResult = await sql.transaction(trx => {
        return [
          trx`UPDATE suggestions
              SET 
                status = 'reviewed',
                reviewed_by = ${adminId},
                reviewed_at = NOW(),
                updated_at = NOW(),
                admin_response = COALESCE(admin_response, '') || ${'\n\n' + message}
              WHERE id = ${suggestionId}
              RETURNING *`
        ];
      });
      updatedSuggestion = updateResult[0][0];
    } else {
      const noteResult = await sql.transaction(trx => {
        return [
          trx`UPDATE suggestions
              SET
                admin_notes = COALESCE(admin_notes, '[]'::jsonb) || 
                  ${JSON.stringify({
                    admin_id: adminId,
                    timestamp: new Date().toISOString(),
                    message
                  })}::jsonb,
                updated_at = NOW()
              WHERE id = ${suggestionId}
              RETURNING *`
        ];
      });
      updatedSuggestion = noteResult[0][0];
    }
    
    // Send response email to user if notification preference is true
    if (suggestion.user_notification_preference) {
      this.sendUserResponse({
        userEmail: suggestion.email,
        userName: suggestion.full_name,
        message,
        suggestionId,
        statusUpdate
      }).catch(err => console.error("Failed to send user response:", err));
    }
    
    return updatedSuggestion;
  } catch (error) {
    throw this.handleDatabaseError(error, "sending direct response");
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
        categories: categoryStats
      };
    } catch (error) {
      throw this.handleDatabaseError(error, "fetching suggestion statistics");
    }
  }

  /**
   * Get all suggestions (admin view)
   * @param {Object} filters - Filter criteria
   * @param {number} page - Pagination page
   * @param {number} limit - Items per page
   * @param {string} sortBy - Sort field
   * @param {string} sortDirection - Sort direction
   * @returns {Promise<Object>} Filtered suggestions
   */
  static async getAllSuggestions(
    filters = {}, 
    page = 1, 
    limit = 20,
    sortBy = 'created_at',
    sortDirection = 'desc'
  ) {
    try {
      return await this.getAdminDashboardSuggestions(
        filters, 
        page, 
        limit,
        sortBy,
        sortDirection
      );
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
/**
   * Permanently delete suggestion (admin only)
   */
static async adminDeleteSuggestion(id, adminId) {
  try {
    const result = await sql.transaction(trx => {
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
            WHERE suggestion_id = ${id}`
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



  /**
   * Bulk archive suggestions
   * @param {string[]} ids - Array of suggestion IDs
   * @param {string} adminId - Admin ID
   * @param {string} reason - Archive reason
   * @returns {Promise<Object>} Result with count
   */
  /**
   * Bulk archive suggestions
   */
  static async bulkArchiveSuggestions(ids, adminId, reason = '') {
    try {
      const result = await sql.transaction(trx => {
        return [
          // Verify admin
          trx`SELECT id FROM users 
              WHERE id = ${adminId} AND role IN ('admin', 'super_admin')`,
          
          // Bulk archive
          trx`UPDATE suggestions
              SET 
                is_archived = true,
                archived_at = NOW(),
                archived_by = ${adminId},
                archived_reason = ${reason},
                updated_at = NOW()
              WHERE id IN ${trx(ids)}
                AND deleted_at IS NULL
              RETURNING id`
        ];
      });
      
      const [adminResults, archiveResults] = result;
      const admin = adminResults[0];
      
      if (!admin) {
        throw new Error("Unauthorized: Admin privileges required");
      }
      
      return { 
        count: archiveResults.length,
        ids: archiveResults.map(row => row.id)
      };
    } catch (error) {
      throw this.handleDatabaseError(error, "bulk archiving suggestions");
    }
  }

  /**
   * Bulk update status
   * @param {string[]} ids - Array of suggestion IDs 
   * @param {string} status - New status
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Result with count
   */
 /**
   * Bulk update status
   */
 static async bulkUpdateStatus(ids, status, adminId) {
  try {
    if (!this.STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    
    const result = await sql.transaction(trx => {
      return [
        // Verify admin
        trx`SELECT id FROM users 
            WHERE id = ${adminId} AND role IN ('admin', 'super_admin')`,
        
        // Bulk update
        trx`UPDATE suggestions
            SET 
              status = ${status},
              reviewed_by = ${adminId},
              reviewed_at = NOW(),
              updated_at = NOW()
            WHERE id IN ${trx(ids)}
              AND deleted_at IS NULL
            RETURNING id, user_id`
      ];
    });
    
    const [adminResults, updateResults] = result;
    const admin = adminResults[0];
    
    if (!admin) {
      throw new Error("Unauthorized: Admin privileges required");
    }
    
    // Get user information for notifications in a separate query
    const userIds = [...new Set(updateResults.map(row => row.user_id))];
    
    if (userIds.length > 0) {
      const users = await sql`
        SELECT id, email, full_name
        FROM users
        WHERE id IN ${sql(userIds)}
      `;
      
      // Prepare notifications
      const userMap = users.reduce((map, user) => {
        map[user.id] = user;
        return map;
      }, {});
      
      // Queue bulk notifications
      updateResults.forEach(suggestion => {
        const user = userMap[suggestion.user_id];
        if (user && user.email) {
          this.sendStatusUpdateNotification(suggestion.id, status, user).catch(err => 
            console.error(`Failed to notify user ${user.id} about suggestion ${suggestion.id}:`, err)
          );
        }
      });
    }
    
    return { 
      count: updateResults.length,
      ids: updateResults.map(row => row.id)
    };
  } catch (error) {
    throw this.handleDatabaseError(error, "bulk updating status");
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
      // Get all admin emails
      const admins = await sql`
        SELECT email FROM users WHERE role IN ('admin', 'super_admin')
      `;
  
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
  
      // Notify user if requested
      if (suggestion.user_notification_preference && suggestion.user_email) {
        if (!suggestion.user_email || suggestion.user_email.trim() === '') {
          throw new Error(`User ${suggestion.user_name} has no valid email address`);
        }
  
        await notifyUser({
          userEmail: suggestion.user_email,
          userName: suggestion.user_name,
          suggestionId: suggestion.id,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Notification system error:", error);
      throw new Error("Failed to send notifications");
    }
  }

  // Status update notification handler
  static async handleStatusUpdateNotification(suggestion) {
    try {
      // Send email to user about status update
      await notifyUser({
        userEmail: suggestion.user_email,
        userName: suggestion.user_name,
        suggestionId: suggestion.id,
        status: suggestion.status,
        adminResponse: suggestion.admin_response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Status update notification error:", error);
      throw new Error("Failed to send status update notification");
    }
  }

  // Bulk status update notification
  static async sendStatusUpdateNotification(suggestionId, status, user) {
    try {
      // This would be implemented in your email utility
      await notifyUser({
        userEmail: user.email,
        userName: user.full_name,
        suggestionId,
        status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Status update notification error:", error);
    }
  }

  // User response sender
  static async sendUserResponse({ userEmail, userName, message, suggestionId, statusUpdate }) {
    try {
      // This would be implemented in your email utility
      await notifyUser({
        userEmail,
        userName,
        suggestionId,
        adminResponse: message,
        status: statusUpdate ? 'reviewed' : undefined,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("User response email error:", error);
      throw new Error("Failed to send response email");
    }
  }

  // Error handler
  static handleDatabaseError(error, context) {
    console.error(`Database Error (${context}):`, error);
    return new Error(`Failed to complete operation: ${error.message}`);
  }
}

module.exports = SuggestionModel;