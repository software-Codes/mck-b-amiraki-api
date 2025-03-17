/**
 * Custom API Error class for standardized error handling
 */
class APIError extends Error {
    /**
     * Create a new API Error
     * @param {string} message - Error message
     * @param {number} statusCode - HTTP status code
     * @param {Error|Object} originalError - Original error or additional error data
     */
    constructor(message, statusCode = 500, originalError = null) {
      super(message);
      this.statusCode = statusCode;
      this.name = this.constructor.name;
      
      if (originalError) {
        if (originalError instanceof Error) {
          this.stack = originalError.stack;
          this.originalMessage = originalError.message;
        } else {
          this.details = originalError;
        }
      }
      
      Error.captureStackTrace(this, this.constructor);
    }
  
    /**
     * Create a not found error
     * @param {string} resourceName - Name of the resource that was not found
     * @param {string} resourceId - ID of the resource that was not found
     * @returns {APIError} - Not found error
     */
    static notFound(resourceName, resourceId = '') {
      const message = resourceId
        ? `${resourceName} with ID ${resourceId} not found`
        : `${resourceName} not found`;
      return new APIError(message, 404);
    }
  
/**
 * Create a validation error
 * @param {Object} errors - Validation errors
 * @returns {APIError} - Validation error
 */
static validationError(errors) {
    return new APIError('Validation failed', 400, { errors });
}
  
  
    /**
     * Create an unauthorized error
     * @param {string} message - Error message
     * @returns {APIError} - Unauthorized error
     */
    static unauthorized(message = 'Unauthorized access') {
      return new APIError(message, 401);
    }
  
    /**
     * Create a forbidden error
     * @param {string} message - Error message
     * @returns {APIError} - Forbidden error
     */
    static forbidden(message = 'Forbidden access') {
      return new APIError(message, 403);
    }
  
    /**
     * Create a conflict error
     * @param {string} message - Error message
     * @returns {APIError} - Conflict error
     */
    static conflict(message) {
      return new APIError(message, 409);
    }
  
    /**
     * Create a server error
     * @param {Error} originalError - Original error
     * @returns {APIError} - Server error
     */
    static serverError(originalError) {
      return new APIError(
        'Internal server error',
        500,
        originalError
      );
    }
  
    /**
     * Create a bad request error
     * @param {string} message - Error message
     * @param {Object} details - Additional error details
     * @returns {APIError} - Bad request error
     */
    static badRequest(message, details = null) {
      return new APIError(message, 400, details);
    }
  }
  
  /**
   * Global error handler middleware
   * @param {Error} err - Error object
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  const errorHandler = (err, req, res, next) => {
    // Default error
    let error = err;
  
    // If it's not an APIError, convert it
    if (!(err instanceof APIError)) {
      // Handle specific error types
      if (err.name === 'CastError' && err.kind === 'ObjectId') {
        error = APIError.notFound('Resource', err.value);
      } else if (err.name === 'ValidationError') {
        // Mongoose validation error
        const errors = Object.values(err.errors).map(val => val.message);
        error = APIError.validationError(errors);
      } else if (err.code === 11000) {
        // Duplicate key error
        const field = Object.keys(err.keyValue)[0];
        error = APIError.conflict(`Duplicate field: ${field} already exists`);
      } else if (err.name === 'TokenExpiredError') {
        error = APIError.unauthorized('Token expired');
      } else if (err.name === 'JsonWebTokenError') {
        error = APIError.unauthorized('Invalid token');
      } else {
        // Generic server error
        error = APIError.serverError(err);
      }
    }
  
    // Log the error
    console.error(error);
  
    // Send the response
    res.status(error.statusCode).json({
        success: false,
        message: error.message,
        status: error.statusCode,
        ...(error.details && { details: error.details }),
        ...(process.env.NODE_ENV === 'development' && { 
          stack: error.stack,
          originalMessage: error.originalMessage
        })
      });
    
  };
  
  module.exports = {
    APIError,
    errorHandler
  };