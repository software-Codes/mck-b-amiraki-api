const { SuggestionModel } = require("../models/suggestions/suggestions");

/**
 * @namespace ValidationHelpers
 * @description Utility functions for request parameter validation
 */
class ValidationHelpers {
// Example validation helpers (add to ValidationHelpers)
static  validateSuggestionCreation({ description, category, urgency }) {
  const errors = {};
  
  if (!description || description.length < 20) {
    errors.description = "Description must be at least 20 characters";
  }
  
  if (category && !SuggestionModel.CATEGORIES.includes(category)) {
    errors.category = "Invalid suggestion category";
  }
  
  if (urgency && !SuggestionModel.URGENCY_LEVELS.includes(urgency)) {
    errors.urgency = "Invalid urgency level";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
};

module.exports = ValidationHelpers;
