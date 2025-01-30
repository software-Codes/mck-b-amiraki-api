const express = require('express');
const { authMiddleware, requireAdmin } = require('../../middleware/authMiddleware');
const SuggestionController = require('../../controllers/suggestions/suggestionsController');
const router = express.Router();

// Public routes (no authentication required)
router.get('/:id', SuggestionController.getSuggestionById);

// User routes (require authentication)
router.use(authMiddleware); // Apply authMiddleware to all routes below
router.post('/', SuggestionController.createSuggestion);
router.get('/user', SuggestionController.getUserSuggestions);
router.delete('/:id', SuggestionController.deleteSuggestion);

// Admin routes (require admin privileges)
const adminRouter = express.Router();
adminRouter.use(requireAdmin); // Apply requireAdmin middleware to all admin routes
adminRouter.get('/', SuggestionController.getAllSuggestions);
adminRouter.put('/:id', SuggestionController.updateSuggestion);
adminRouter.post('/:id/response', SuggestionController.sendDirectResponse);

// Mount admin routes under /admin
router.use('/admin', adminRouter);

module.exports = router;