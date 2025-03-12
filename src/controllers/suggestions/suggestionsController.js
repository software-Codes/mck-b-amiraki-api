const SuggestionModel  = require("../../models/suggestions/suggestions");
const ValidationHelpers = require("../../utils/validationHelpers");

class SuggestionController {
  constructor() {
    // Bind all methods
    this.createSuggestion = this.createSuggestion.bind(this);
    this.updateSuggestion = this.updateSuggestion.bind(this);
    this.getUserSuggestions = this.getUserSuggestions.bind(this);
    this.getSuggestionById = this.getSuggestionById.bind(this);
    this.deleteSuggestion = this.deleteSuggestion.bind(this);
    this.sendDirectResponse = this.sendDirectResponse.bind(this);
    this.getAllSuggestions = this.getAllSuggestions.bind(this);
    this.adminDeleteSuggestion = this.adminDeleteSuggestion.bind(this);
  }

  // Error handler method
  handleError(res, error) {
    console.error(`SuggestionController Error: ${error.message}`);

    const errorMap = {
      "Suggestion not found": 404,
      "Unauthorized to delete this suggestion": 403,
      "Unauthorized: Admin privileges required": 403,
      "Database operation failed": 500,
    };

    const statusCode = errorMap[error.message] || 500;
    const message =
      statusCode === 500 && process.env.NODE_ENV === "production"
        ? "Internal server error"
        : error.message;

    const response = {
      success: false,
      message,
    };

    if (process.env.NODE_ENV !== "production") {
      response.error = {
        message: error.message,
        stack: error.stack,
      };
    }

    res.status(statusCode).json(response);
  }

  // Create Suggestion
  async createSuggestion(req, res) {
    try {
      const { id: userId } = req.user;
      const { description, isAnonymous = false, category, urgency } = req.body;

      const suggestion = await SuggestionModel.createSuggestion({
        userId,
        description,
        isAnonymous,
        category: category || 'general',
        urgency: urgency || 'normal'
      });

      res.status(201).json({
        success: true,
        message: "Suggestion submitted successfully",
        data: suggestion
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // Update Suggestion
  async updateSuggestion(req, res) {
    try {
      const { id } = req.params;
      const { status, adminResponse } = req.body;
      const { id: adminId, role } = req.user;

      if (!ValidationHelpers.isValidUUID(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid suggestion ID format",
        });
      }

      if (!["admin", "super_admin"].includes(role)) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Admin privileges required",
        });
      }

      const validation = ValidationHelpers.validateAdminResponse({
        message: adminResponse,
        status,
      });

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Invalid update parameters",
          errors: validation.errors,
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
      this.handleError(res, error);
    }
  }

  // Get User Suggestions
  async getUserSuggestions(req, res) {
    try {
      const { id: userId } = req.user;
      const { page = 1, limit = 20 } = req.query;

      const validation = ValidationHelpers.validateRequestParams({
        page,
        limit,
      });
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
          totalPages: Math.ceil(result.total / parseInt(limit)),
        },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // Get Suggestion By ID
  async getSuggestionById(req, res) {
    try {
      const { id } = req.params;

      if (!ValidationHelpers.isValidUUID(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid suggestion ID format",
        });
      }

      const suggestion = await SuggestionModel.getSuggestionById(id);

      if (!suggestion) {
        return res.status(404).json({
          success: false,
          message: "Suggestion not found",
        });
      }

      if (suggestion.is_anonymous) {
        delete suggestion.user_email;
        delete suggestion.user_name;
      }

      res.json({
        success: true,
        data: suggestion,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // Delete Suggestion
  async deleteSuggestion(req, res) {
    try {
      const { id: userId } = req.user;
      const { id: suggestionId } = req.params;

      if (!ValidationHelpers.isValidUUID(suggestionId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid suggestion ID format",
        });
      }

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
      this.handleError(res, error);
    }
  }

  // Send Direct Response
  async sendDirectResponse(req, res) {
    try {
      const { id: suggestionId } = req.params;
      const { message, statusUpdate } = req.body;
      const { id: adminId, role } = req.user;

      if (!ValidationHelpers.isValidUUID(suggestionId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid suggestion ID format",
        });
      }

      if (!["admin", "super_admin"].includes(role)) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Admin privileges required",
        });
      }

      const validation = ValidationHelpers.validateAdminResponse({
        message,
        status: statusUpdate ? "reviewed" : undefined,
      });

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Invalid response parameters",
          errors: validation.errors,
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
      this.handleError(res, error);
    }
  }

  // Get All Suggestions
  async getAllSuggestions(req, res) {
    try {
      const { page = 1, limit = 20, ...filters } = req.query;

      const validation = ValidationHelpers.validateRequestParams({
        page,
        limit,
        ...filters,
      });

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
          totalPages: Math.ceil(result.total / parseInt(limit)),
          filters,
        },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // Admin Delete Suggestion
  async adminDeleteSuggestion(req, res) {
    try {
      const { id } = req.params;
      const { id: adminId } = req.user;
      
      const result = await SuggestionModel.adminDeleteSuggestion(id, adminId);
      res.json({
        success: true,
        message: "Suggestion permanently deleted",
        data: result
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }
}

// Export as singleton instance
module.exports = new SuggestionController();