const express = require('express');
const { authMiddleware, requireAdmin } = require('../../middleware/authMiddleware');
const SuggestionController = require('../../controllers/suggestions/suggestionsController');
const router = express.Router();

// Route groups
const publicRoutes = () => {
  // Public routes (no auth required)
  router.get('/:id', SuggestionController.getSuggestionById);
};

const authenticatedRoutes = () => {
  router.use(authMiddleware);
  
  // User routes (auth required)
  router.post('/', SuggestionController.createSuggestion);
  router.get('/user', SuggestionController.getUserSuggestions);
  router.delete('/:id', SuggestionController.deleteSuggestion);
};

const adminRoutes = () => {
  // Admin only routes
  router.use(requireAdmin(["admin", "super_admin"]));
  router.get("/", SuggestionController.getAllSuggestions);
  router.put("/:id", SuggestionController.updateSuggestion);
  router.post("/:id/response", SuggestionController.sendDirectResponse);
};

// Initialize routes
publicRoutes();
authenticatedRoutes();
adminRoutes();

module.exports = suggestionsRoutes;