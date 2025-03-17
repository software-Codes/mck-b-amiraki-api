const SuggestionModel = require("../../models/suggestions/suggestions-model");
const { APIError } = require("../../utils/global-errorHandler");

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
      const {
        description,
        category = "general",
        urgency = "normal",
        notifyUser = true,
      } = req.body;
      const userId = req.user.id;

      const suggestion = await SuggestionModel.createSuggestion({
        userId,
        description,
        category,
        urgency,
        notifyUser,
      });

      res.status(201).json({
        success: true,
        message: "Suggestion submitted successfully",
        data: suggestion,
      });
    } catch (error) {
      next(new APIError("Failed to create suggestion", 400, error));
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
      // Extract parameters from query
      const {
        page = 1,
        limit = 20,
        sortBy = "created_at",
        sortDirection = "desc",
        status,
        category,
        urgency,
        searchTerm,
      } = req.query;
  
      // Get authenticated user ID
      const userId = req.user.id;
  
      // Validate page and limit are numbers
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
  
      if (isNaN(pageNum) || pageNum < 1) {
        return next(new APIError("Invalid page number", 400));
      }
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return next(new APIError("Invalid limit value", 400));
      }
  
      // Create filters object
      const filters = {
        status: status || undefined,
        category: category || undefined,
        urgency: urgency || undefined,
        searchTerm: searchTerm || undefined,
      };
  
      // Call model method
      const result = await SuggestionModel.getUserSuggestions(
        userId,
        filters,
        pageNum,
        limitNum,
        sortBy,
        sortDirection
      );
  
      // Prepare response
      res.status(200).json({
        success: true,
        message: "User suggestions retrieved successfully",
        data: {
          suggestions: result.suggestions,
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        },
      });
    } catch (error) {
      next(error);
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
        message: "Suggestion deleted successfully",
        data: { id: deleted.id },
      });
    } catch (error) {
      next(
        new APIError(
          "Failed to delete suggestion",
          error.statusCode || 500,
          error
        )
      );
    }
  }

  /**
   * @desc    Get all suggestions with statistics for admin
   * @route   GET /api/suggestions/admin/stats
   * @access  Private/Admin
   * @param   {Object} req - Express request object
   * @param   {Object} req.query - Pagination and sorting parameters
   * @returns {Object} JSON response with suggestions, statistics, and pagination
   */
  static async getSuggestionStats(req, res, next) {
    try {
      // Extract pagination and sorting parameters from query
      const {
        page = 1,
        limit = 20,
        sortBy = "created_at",
        sortDirection = "desc",
        // Filter parameters
        status,
        category,
        urgency,
        searchTerm,
        dateFrom,
        dateTo,
      } = req.query;

      // Create filters object
      const filters = {
        status,
        category,
        urgency,
        searchTerm,
        dateFrom,
        dateTo,
      };

      // Call the model method with proper parameters
      const result = await SuggestionModel.getSuggestionStats(
        filters,
        parseInt(page),
        parseInt(limit),
        sortBy,
        sortDirection
      );

      res.status(200).json({
        success: true,
        message: "Suggestion statistics and data retrieved successfully",
        data: {
          stats: {
            counts: result.counts,
            categories: result.categories,
          },
          suggestions: result.suggestions,
          pagination: result.pagination,
        },
      });
    } catch (error) {
      next(new APIError("Failed to retrieve suggestion statistics", 500, error));
    }
  }

  /**
   * @desc    Get a single suggestion by ID (Admin)
   * @route   GET /api/suggestions/admin/:id
   * @access  Private/Admin
   * @param   {Object} req - Express request object
   * @param   {string} req.params.id - Suggestion ID
   * @returns {Object} JSON response with suggestion details
   */
  static async getSuggestionById(req, res, next) {
    try {
      const { id } = req.params;
      const suggestion = await SuggestionModel.getSuggestionById(id);

      if (!suggestion) {
        return next(new APIError("Suggestion not found", 404));
      }

      res.status(200).json({
        success: true,
        message: "Suggestion retrieved successfully",
        data: suggestion,
      });
    } catch (error) {
      next(new APIError("Failed to retrieve suggestion", 500, error));
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
        message: "Suggestion permanently deleted",
        data: { id: deleted.id },
      });
    } catch (error) {
      next(
        new APIError(
          "Failed to delete suggestion",
          error.statusCode || 500,
          error
        )
      );
    }
  }
}

module.exports = SuggestionController;