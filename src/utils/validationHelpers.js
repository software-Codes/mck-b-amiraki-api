const { SuggestionModel } = require("../models/suggestions/suggestions");

/**
 * @namespace ValidationHelpers
 * @description Utility functions for request parameter validation
 */
const ValidationHelpers = {
  /**
   * Validates common request parameters including pagination and filters
   * @param {Object} params - Parameters to validate
   * @param {number} [params.page] - Page number
   * @param {number} [params.limit] - Items per page
   * @param {string} [params.status] - Suggestion status
   * @param {boolean} [params.isAnonymous] - Anonymous filter
   * @param {string} [params.search] - Search term
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validateRequestParams(params) {
    const errors = [];
    const { page, limit, status, isAnonymous, search } = params;

    // Validate pagination
    if (page !== undefined) {
      const pageNum = Number(page);
      if (isNaN(pageNum) || pageNum < 1) {
        errors.push("Page must be a positive number");
      }
    }

    if (limit !== undefined) {
      const limitNum = Number(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        errors.push("Limit must be a number between 1 and 100");
      }
    }

    // Validate status if provided
    if (status !== undefined) {
      try {
        SuggestionModel.validateStatus(status);
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Validate isAnonymous if provided
    if (isAnonymous !== undefined) {
      if (
        typeof isAnonymous !== "boolean" &&
        isAnonymous !== "true" &&
        isAnonymous !== "false"
      ) {
        errors.push("isAnonymous must be a boolean value");
      }
    }

    // Validate search term if provided
    if (search !== undefined) {
      if (typeof search !== "string") {
        errors.push("Search term must be a string");
      } else if (search.length < 2) {
        errors.push("Search term must be at least 2 characters long");
      } else if (search.length > 50) {
        errors.push("Search term cannot exceed 50 characters");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Validates suggestion creation/update parameters
   * @param {Object} params - Suggestion parameters
   * @param {string} params.title - Suggestion title
   * @param {string} params.description - Suggestion description
   * @param {boolean} [params.isAnonymous] - Anonymous submission flag
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validateSuggestionParams(params) {
    const errors = [];
    const { title, description, isAnonymous } = params;

    // Validate title
    try {
      SuggestionModel.validateTitle(title);
    } catch (error) {
      errors.push(error.message);
    }

    // Validate description
    try {
      SuggestionModel.validateDescription(description);
    } catch (error) {
      errors.push(error.message);
    }

    // Validate isAnonymous if provided
    if (isAnonymous !== undefined && typeof isAnonymous !== "boolean") {
      errors.push("isAnonymous must be a boolean value");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Validates admin response parameters
   * @param {Object} params - Response parameters
   * @param {string} params.message - Response message
   * @param {string} [params.status] - New status
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validateAdminResponse(params) {
    const errors = [];
    const { message, status } = params;

    // Validate message
    if (!message || typeof message !== "string") {
      errors.push("Response message is required");
    } else if (message.length < 10) {
      errors.push("Response message must be at least 10 characters long");
    } else if (message.length > 1000) {
      errors.push("Response message cannot exceed 1000 characters");
    }

    // Validate status if provided
    if (status !== undefined) {
      try {
        SuggestionModel.validateStatus(status);
      } catch (error) {
        errors.push(error.message);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Validates UUID format
   * @param {string} id - UUID to validate
   * @returns {boolean} True if valid UUID
   */
  isValidUUID(id) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  },
};

module.exports = ValidationHelpers;
