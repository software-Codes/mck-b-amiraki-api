const {
  getSuggestionById,
  SuggestionModel,
} = require("../../models/suggestions/suggestions");

/**
 * @namespace SuggestionController
 * @description Handles all suggestion-related HTTP requests and responses
 */
const SuggestionController = {
  /**
   * @desc Create a new suggestion
   * @route POST /api/suggestions
   * @access Private
   */
  async createSuggestion(req, res) {
    try {
      const { id: userId } = req.user;
      const { title, description, isAnonymous = false } = req.body;

      // Validate required fields
      const missingFields = [];
      if (!title) missingFields.push("title");
      if (!description) missingFields.push("description");
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(", ")}`,
        });
      }

      const suggestion = await SuggestionModel.createSuggestion({
        userId,
        title,
        description,
        isAnonymous,
      });

      res.status(201).json({
        success: true,
        message: "Suggestion submitted successfully",
        data: suggestion,
      });
    } catch (error) {
      this.handleError(res, error, {
        validation: 400,
        notFound: 404,
        default: 500,
        custom: {
          "Unauthorized to delete this suggestion": 403,
        },
      });
    }
  },

  /**
   * @desc Update a suggestion (Admin only)
   * @route PUT /api/suggestions/:id
   * @access Private/Admin
   */
  async updateSuggestion(req, res) {
    try {
      const { id } = req.params;
      const { status, adminResponse } = req.body;
      const { id: adminId, role } = req.user;

      // Authorization check
      if (!["admin", "super_admin"].includes(role)) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Admin privileges required",
        });
      }

      const updatedSuggestion = await SuggestionModel.updateSuggestion({
        id,
        status,
        adminResponse,
        adminId,
      });

      res.json({
        success: true,
        message: "Suggestion updated successfully",
        data: updatedSuggestion,
      });
    } catch (error) {
      this.handleError(res, error, {
        validation: 400,
        notFound: 404,
        default: 500,
      });
    }
  },
  /**
   * @desc Get paginated suggestions for a user
   * @route GET /api/suggestions/user
   * @access Private
   */
  async getUserSuggestions(req, res) {
    try {
      const { id: userId } = req.user;
      const { page = 1, limit = 20 } = req.query;

      // Validate pagination parameters
      const validation = validateRequestParams({ page, limit });
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Invalid pagination parameters",
          errors: validation.errors,
        });
      }

      const result = await SuggestionModel.getUserSuggestions(
        userId,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result.suggestions,
        meta: {
          total: result.total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error) {
      this.handleError(res, error, { default: 500 });
    }
  },
  /**
   * @desc Get single suggestion by ID
   * @route GET /api/suggestions/:id
   * @access Public
   */
  async getSuggestionById(req, res) {
    try {
      const { id } = req.params;
      const suggestion = await SuggestionModel.getSuggestionById(id);

      if (!suggestion) {
        return res.status(404).json({
          success: false,
          message: "Suggestion not found",
        });
      }

      // Hide user email if anonymous
      if (suggestion.is_anonymous) {
        delete suggestion.user_email;
        delete suggestion.user_name;
      }

      res.json({
        success: true,
        data: suggestion,
      });
    } catch (error) {
      this.handleError(res, error, {
        notFound: 404,
        default: 500,
      });
    }
  },
  /**
   * @desc Delete a suggestion
   * @route DELETE /api/suggestions/:id
   * @access Private
   */
  async deleteSuggestion(req, res) {
    try {
      const { id: userId } = req.user;
      const { id: suggestionId } = req.params;

      const deletedSuggestion = await SuggestionModel.deleteSuggestion(
        suggestionId,
        userId
      );

      res.json({
        success: true,
        message: "Suggestion deleted successfully",
        data: deletedSuggestion,
      });
    } catch (error) {
      this.handleError(res, error, {
        notFound: 404,
        custom: {
          "Unauthorized to delete this suggestion": 403,
        },
        default: 500,
      });
    }
  },
  /**
   * @desc Send direct response to user (Admin only)
   * @route POST /api/suggestions/:id/response
   * @access Private/Admin
   */
  async sendDirectResponse(req, res) {
    try {
      const { id: suggestionId } = req.params;
      const { message, statusUpdate } = req.body;
      const { id: adminId, role } = req.user;

      if (!["admin", "super_admin"].includes(role)) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Admin privileges required",
        });
      }

      const updated = await SuggestionModel.sendDirectResponse({
        suggestionId,
        adminId,
        message,
        statusUpdate,
      });

      res.json({
        success: true,
        message: "Response sent successfully",
        data: updated,
      });
    } catch (error) {
      this.handleError(res, error, {
        notFound: 404,
        validation: 400,
        default: 500,
      });
    }
  },
  /**
   * @desc Get all suggestions with filters (Admin only)
   * @route GET /api/suggestions
   * @access Private/Admin
   */
  async getAllSuggestions(req, res) {
    try {
      const { page = 1, limit = 20, ...filters } = req.query;

      // Validate pagination and filters
      const validation = validateRequestParams({ page, limit, ...filters });
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Invalid request parameters",
          errors: validation.errors,
        });
      }

      const result = await SuggestionModel.getAllSuggestions(
        filters,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result.suggestions,
        meta: {
          total: result.total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(result.total / limit),
          filters,
        },
      });
    } catch (error) {
      this.handleError(res, error, { default: 500 });
    }
  },
  /**
   * @desc Unified error handler for suggestion routes
   * @param {Object} res - Express response object
   * @param {Error} error - Thrown error
   * @param {Object} statusMap - HTTP status code mappings
   */
  handleError(res, error, statusMap = {}) {
    console.error(`SuggestionController Error: ${error.message}`);

    const statusCodes = {
      ...statusMap,
      "Suggestion not found": 404,
      "Unauthorized access": 403,
    };

    const message = error.message;
    const statusCode =
      statusCodes[message] ||
      statusMap[error.constructor.name] ||
      statusMap.default ||
      500;

    const response = {
      success: false,
      message: statusCode === 500 ? "Internal server error" : message,
    };

    if (process.env.NODE_ENV !== "production") {
      response.error = {
        message: error.message,
        stack: error.stack,
      };
    }

    res.status(statusCode).json(response);
  },
};

module.exports = SuggestionController;
