const express = require('express');
const { authMiddleware, requireAdmin } = require('../../middleware/authMiddleware');
const SuggestionController = require('../../controllers/suggestions/suggestionsController');
const rateLimit = require('express-rate-limit');
const validate = require('../../middleware/validationMiddleware');
const { logger } = require('../../utils/logger');

const router = express.Router();

// Request logging middleware
const requestLogger = (req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, {
    userId: req.user?.id || 'unauthenticated',
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
};

// Response time middleware
const responseTime = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`Request completed in ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode
    });
  });
  next();
};

// Apply middleware to all routes
router.use(requestLogger);
router.use(responseTime);

// Rate limiting for suggestion submissions
const suggestionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    success: false,
    message: 'Too many suggestions created. Please try again later.',
    status: 429
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userId: req.user?.id,
      endpoint: req.originalUrl
    });
    res.status(429).json(options.message);
  }
});

// Authenticated user routes ---------------------------------------------------
router.use(authMiddleware); // All following routes require authentication

/**
 * @desc    Create new suggestion
 * @route   POST /api/suggestions
 * @access  Private
 */
router.post(
  '/', 
  suggestionLimiter,
  validate.createSuggestion,
  SuggestionController.createSuggestion
);

/**
 * @desc    Get current user's suggestions
 * @route   GET /api/suggestions
 * @access  Private
 */
router.get(
  '/', 
  validate.paginationParams,
  SuggestionController.getUserSuggestions
);

/**
 * @desc    Delete user's own suggestion
 * @route   DELETE /api/suggestions/:id
 * @access  Private
 */
router.delete(
  '/:id', 
  validate.suggestionId,
  SuggestionController.deleteSuggestion
);

// Admin routes -----------------------------------------------------------------
const adminRouter = express.Router();
adminRouter.use(requireAdmin); // All admin routes require admin privileges

/**
 * @desc    Admin - Get all suggestions
 * @route   GET /api/suggestions/admin
 * @access  Private/Admin
 */
adminRouter.get(
  '/', 
  validate.adminSuggestionFilters,
  SuggestionController.getAllSuggestions
);

/**
 * @desc    Admin - Delete any suggestion
 * @route   DELETE /api/suggestions/admin/:id
 * @access  Private/Admin
 */
adminRouter.delete(
  '/:id', 
  validate.suggestionId,
  SuggestionController.adminDeleteSuggestion
);

/**
 * @desc    Admin - Send direct response to suggestion
 * @route   POST /api/suggestions/admin/:id/response
 * @access  Private/Admin
 */
adminRouter.post(
  '/:id/response', 
  validate.suggestionResponse,
  SuggestionController.sendDirectResponse
);

// Mount admin routes
router.use('/admin', adminRouter);

// Error handling middleware
router.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  logger.error(`${statusCode} - ${message}`, {
    error: err.stack,
    userId: req.user?.id,
    url: req.originalUrl,
    method: req.method
  });
  
  res.status(statusCode).json({
    success: false,
    message,
    status: statusCode,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = router;