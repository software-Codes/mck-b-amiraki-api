const SuggestionModel = require('../../models/suggestions/suggestions-model');
// const { APIError } = require('../../utils/errorHandler');

class SuggestionController {
  /**
   * @desc    Create a new suggestion
   * @route   POST /api/suggestions
   * @access  Private
   * @param   {Object} req - Express request object
   * @param   {Object} req.body - Suggestion data
   * @param   {string} req.user.id - Authenticated user ID
   * @returns {Object} JSON response with created suggestion
   */
  static async createSuggestion(req, res, next) {
    try {
      const { description, category = 'general', urgency = 'normal', notifyUser = true } = req.body;
      const userId = req.user.id;

      const suggestion = await SuggestionModel.createSuggestion({
        userId,
        description,
        category,
        urgency,
        notifyUser
      });

      res.status(201).json({
        success: true,
        message: 'Suggestion submitted successfully',
        data: suggestion
      });
    } catch (error) {
      console.log(error);
      next(new APIError('Failed to create suggestion', 400, error));
    }
  }

  /**
   * @desc    Get authenticated user's suggestions
   * @route   GET /api/suggestions
   * @access  Private
   * @param   {Object} req - Express request object
   * @param   {Object} req.query - Pagination and sorting parameters
   * @returns {Object} JSON response with suggestions and pagination info
   */
  static async getUserSuggestions(req, res, next) {
    try {
      const { page = 1, limit = 20, sortBy = 'created_at', sortDirection = 'desc' } = req.query;
      const userId = req.user.id;

      const result = await SuggestionModel.getUserSuggestions(
        userId,
        parseInt(page),
        parseInt(limit),
        sortBy,
        sortDirection
      );

      res.status(200).json({
        success: true,
        message: 'User suggestions retrieved successfully',
        data: {
          suggestions: result.suggestions,
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages
          }
        }
      });
    } catch (error) {
      next(new APIError('Failed to retrieve user suggestions', 500, error));
    }
  }

  /**
   * @desc    Delete a user's own suggestion
   * @route   DELETE /api/suggestions/:id
   * @access  Private
   * @param   {Object} req - Express request object
   * @param   {string} req.params.id - Suggestion ID
   * @param   {string} req.user.id - Authenticated user ID
   * @returns {Object} JSON response with deletion confirmation
   */
  static async deleteSuggestion(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const deleted = await SuggestionModel.deleteSuggestion(id, userId);

      res.status(200).json({
        success: true,
        message: 'Suggestion deleted successfully',
        data: { id: deleted.id }
      });
    } catch (error) {
      next(new APIError('Failed to delete suggestion', error.statusCode || 500, error));
    }
  }

  /**
   * @desc    Get all suggestions (Admin)
   * @route   GET /api/suggestions/admin
   * @access  Private/Admin
   * @param   {Object} req - Express request object
   * @param   {Object} req.query - Filter, pagination, and sorting parameters
   * @returns {Object} JSON response with suggestions and admin dashboard data
   */
  static async getAllSuggestions(req, res, next) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        sortBy = 'created_at', 
        sortDirection = 'desc',
        ...filters 
      } = req.query;

      const result = await SuggestionModel.getAdminDashboardSuggestions(
        filters,
        parseInt(page),
        parseInt(limit),
        sortBy,
        sortDirection
      );

      res.status(200).json({
        success: true,
        message: 'Suggestions retrieved successfully',
        data: {
          suggestions: result.suggestions,
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages
          }
        }
      });
    } catch (error) {
      next(new APIError('Failed to retrieve suggestions', 500, error));
    }
  }

  /**
   * @desc    Permanently delete a suggestion (Admin)
   * @route   DELETE /api/suggestions/admin/:id
   * @access  Private/Admin
   * @param   {Object} req - Express request object
   * @param   {string} req.params.id - Suggestion ID
   * @returns {Object} JSON response with deletion confirmation
   */
  static async adminDeleteSuggestion(req, res, next) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      const deleted = await SuggestionModel.adminDeleteSuggestion(id, adminId);

      res.status(200).json({
        success: true,
        message: 'Suggestion permanently deleted',
        data: { id: deleted.id }
      });
    } catch (error) {
      next(new APIError('Failed to delete suggestion', error.statusCode || 500, error));
    }
  }

  /**
   * @desc    Send direct response to a suggestion (Admin)
   * @route   POST /api/suggestions/admin/:id/response
   * @access  Private/Admin
   * @param   {Object} req - Express request object
   * @param   {string} req.params.id - Suggestion ID
   * @param   {string} req.user.id - Admin ID
   * @param   {Object} req.body - Response details
   * @returns {Object} JSON response with updated suggestion
   */
  static async sendDirectResponse(req, res, next) {
    try {
      const { id } = req.params;
      const { message, statusUpdate = false } = req.body;
      const adminId = req.user.id;

      const suggestion = await SuggestionModel.sendDirectResponse({
        suggestionId: id,
        adminId,
        message,
        statusUpdate
      });

      res.status(200).json({
        success: true,
        message: 'Response sent successfully',
        data: suggestion
      });
    } catch (error) {
      next(new APIError('Failed to send response', error.statusCode || 500, error));
    }
  }
}

module.exports = SuggestionController;