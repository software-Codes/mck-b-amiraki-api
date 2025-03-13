const express = require('express');
const { authMiddleware, requireAdmin } = require('../../middleware/authMiddleware');
const SuggestionController = require('../../controllers/suggestions/suggestionsController'); // Fix this line
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting configuration
const suggestionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each user to 5 suggestions per window
  message: 'Too many suggestions submitted, please try again later'
});

// Public routes
router.get('/:id', SuggestionController.getSuggestionById);

// Authenticated user routes
router.use(authMiddleware);
router.post('/', suggestionLimiter, SuggestionController.createSuggestion);
router.get('/', SuggestionController.getUserSuggestions);
router.delete('/:id', SuggestionController.deleteSuggestion);

// Admin routes
const adminRouter = express.Router();
adminRouter.use(requireAdmin);

// Remove the duplicate requireAdmin middleware
adminRouter.delete('/:id', SuggestionController.adminDeleteSuggestion);
adminRouter.get('/', SuggestionController.getAllSuggestions);
adminRouter.post('/:id/response', SuggestionController.sendDirectResponse);

router.use('/admin', adminRouter);

module.exports = router;