const { body, query, param, validationResult } = require('express-validator');
const { APIError } = require('../utils/errorHandler/suggestions-errohandler');

/**
 * Middleware to validate request data
 * @param {Array} validations - Array of validation chains
 * @returns {Function} Express middleware
 */
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const extractedErrors = errors.array().map(err => ({
      [err.param]: err.msg
    }));

    return next(new APIError('Validation failed', 400, { errors: extractedErrors }));
  };
};

const validationMiddleware = {
  // Validate suggestion creation
  createSuggestion: validate([
    body('description')
      .notEmpty().withMessage('Description is required')
      .isString().withMessage('Description must be a string')
      .isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10 and 1000 characters'),
    body('category')
      .optional()
      .isString().withMessage('Category must be a string')
      .isIn(['general', 'feature', 'bug', 'improvement']).withMessage('Invalid category'),
    body('urgency')
      .optional()
      .isString().withMessage('Urgency must be a string')
      .isIn(['low', 'normal', 'high', 'critical']).withMessage('Invalid urgency level'),
    body('notifyUser')
      .optional()
      .isBoolean().withMessage('notifyUser must be a boolean')
  ]),

  // Validate pagination parameters
  paginationParams: validate([
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sortBy')
      .optional()
      .isString().withMessage('sortBy must be a string')
      .isIn(['created_at', 'updated_at', 'urgency', 'category']).withMessage('Invalid sort field'),
    query('sortDirection')
      .optional()
      .isString().withMessage('sortDirection must be a string')
      .isIn(['asc', 'desc']).withMessage('Sort direction must be asc or desc')
  ]),

  // Validate suggestion ID
  suggestionId: validate([
    param('id')
      .notEmpty().withMessage('Suggestion ID is required')
      .isMongoId().withMessage('Invalid suggestion ID format')
  ]),

  // Validate admin suggestion filters
  adminSuggestionFilters: validate([
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sortBy')
      .optional()
      .isString().withMessage('sortBy must be a string')
      .isIn(['created_at', 'updated_at', 'urgency', 'category', 'status']).withMessage('Invalid sort field'),
    query('sortDirection')
      .optional()
      .isString().withMessage('sortDirection must be a string')
      .isIn(['asc', 'desc']).withMessage('Sort direction must be asc or desc'),
    query('status')
      .optional()
      .isString().withMessage('Status must be a string')
      .isIn(['pending', 'in_progress', 'completed', 'rejected']).withMessage('Invalid status'),
    query('category')
      .optional()
      .isString().withMessage('Category must be a string')
      .isIn(['general', 'feature', 'bug', 'improvement']).withMessage('Invalid category'),
    query('urgency')
      .optional()
      .isString().withMessage('Urgency must be a string')
      .isIn(['low', 'normal', 'high', 'critical']).withMessage('Invalid urgency level'),
    query('userId')
      .optional()
      .isMongoId().withMessage('Invalid user ID format'),
    query('fromDate')
      .optional()
      .isISO8601().withMessage('fromDate must be a valid date'),
    query('toDate')
      .optional()
      .isISO8601().withMessage('toDate must be a valid date')
  ]),

  // Validate suggestion response
  suggestionResponse: validate([
    param('id')
      .notEmpty().withMessage('Suggestion ID is required')
      .isMongoId().withMessage('Invalid suggestion ID format'),
    body('message')
      .notEmpty().withMessage('Response message is required')
      .isString().withMessage('Message must be a string')
      .isLength({ min: 5, max: 1000 }).withMessage('Message must be between 5 and 1000 characters'),
    body('statusUpdate')
      .optional()
      .isBoolean().withMessage('statusUpdate must be a boolean')
  ])
};

module.exports = validationMiddleware;