const express = require("express");
const router = express.Router();
const MediaContentController = require("../../controllers/churchgallery/mediaContentController");
const {
  authMiddleware,
  requireAdmin,
} = require("../../middleware/authMiddleware");

/**
 * @route POST /api/media
 * @desc Upload new media content
 * @access Admin only
 */

router.post(
  "/",
  authMiddleware,
  requireAdmin,
  MediaContentController.uploadContent

);

/**
 * @route GET /api/media
 * @desc Get all media content with pagination and filtering
 * @access Public
 */
router.get("/", MediaContentController.getAllContent, authMiddleware);
/**
 * @route GET /api/media/:id
 * @desc Get single media content by ID
 * @access Public
 */
router.get('/:id',
    
    MediaContentController.getContentById, authMiddleware
  );

  /**
 * @route DELETE /api/media/:id
 * @desc Delete media content
 * @access Admin only
 */

  router.delete('/:id',
    authMiddleware,
    requireAdmin,
    MediaContentController.deleteContent
  );

module.exports = router;
