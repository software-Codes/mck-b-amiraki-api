const multer = require("multer");
const { validationResult } = require("express-validator");
const { MediaContent } = require("../../models/churchgallery/MediaContent");
const {
  AzureStorageService,
} = require("../../models/churchgallery/azureStorage");
const { RedisService } = require("../../models/churchgallery/redisCache");

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(), // Keep using memory storage for Azure uploads
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = {
      image: ["image/jpeg", "image/png", "image/gif"],
      video: ["video/mp4", "video/mpeg", "video/quicktime"],
    };
    const contentType = req.body.contentType;
    if (!contentType || !allowedTypes[contentType]?.includes(file.mimetype)) {
      cb(new Error("Invalid file type"));
      return;
    }
    cb(null, true);
  },
}).single("file");

// Initialize services
const azureStorageService = new AzureStorageService();
const redisService = new RedisService();

/**
 * Media Content Controller
 * Handles all media content related operations
 */

class MediaContentController {
  /**
   * Upload new media content
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   */

  static async uploadContent(req, res) {
    try {
      //handle files upload
      await new promise((resolve, reject) => {
        upload(req, res, (err) => {
          if (err) reject(err);
          resolve();
        });
      });

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Upload to Azure Storage
      const url = await azureStorageService.uploadFile(
        req.file,
        req.body.contentType
      );

      // Generate thumbnail for videos (if applicable)
      let thumbnailUrl = null;
      if (req.body.contentType === "video" && req.body.thumbnailBase64) {
        const thumbnailBuffer = Buffer.from(req.body.thumbnailBase64, "base64");
        thumbnailUrl = await azureStorage.uploadFile(
          { buffer: thumbnailBuffer, mimetype: "image/jpeg" },
          "thumbnails"
        );
      }

      // Create database record
      const mediaContent = await MediaContent.create({
        title: req.body.title,
        description: req.body.description,
        contentType: req.body.contentType,
        url,
        thumbnailUrl,
        uploadedBy: req.user.id,
        size: req.file.size,
        duration: req.body.duration || null,
      });
      // Invalidate relevant cache
      await redisService.invalidate("media:list:*");

      res.status(201).json(mediaContent);
    } catch (error) {
      console.error("Failed to upload media content:", error);
      res.status(500).json({ error: "Failed to upload media content" });
    }
  }

  /**
   * Get all media content with pagination and filtering
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   */

  static async getAllContent(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const contentType = req.query.contentType;

      // Try to get from cache
      const cacheKey = `media:list:${page}:${limit}:${contentType || "all"}`;
      const cachedData = await redisService.get(cacheKey);

      if (cachedData) {
        return res.json(cachedData);
      }
      // Get from database
      const mediaContents = await MediaContent.findAll({
        page,
        limit,
        contentType,
      });

      // Store in cache for 1 hour
      await redisService.set(cacheKey, mediaContents);

      res.json(mediaContents);
    } catch (error) {
      console.error("Failed to get media content:", error);
      res.status(500).json({ error: "Failed to get media content" });
    }
  }

  /**
   * Get single media content by ID
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   */

  static async getContentById(req, res) {
    try {
      const { id } = req.params;

      //try to get from cache
      const cacheKey = `media:single:${id}`;
      const cachedData = await redisCache.get(cacheKey);
      if (cachedData) {
        return res.json(cachedData);
      }

      // Get from database
      const mediaContent = await MediaContent.findById(id);

      if (!mediaContent) {
        return res.status(404).json({ error: "Media content not found" });
      }
      // Update view count
      await MediaContent.updateViewCount(id);

      // Store in cache for 1 hour
      await redisService.set(cacheKey, mediaContent);
      res.json(mediaContent);
    } catch (error) {
      console.error("Failed to get media content:", error);
      res.status(500).json({ error: "Failed to get media content by id" });
    }
  }
  /**
   * Delete media content
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   */
  static async deleteContent(req, res) {
    try {
      const { id } = req.params;
      //check if the media content exists
      const content = await MediaContent.findById(id);
      if (!content) {
        return res.status(404).json({ error: "Media content not found" });
      }

      // Delete from Azure Storage
      await azureStorageService.deleteFile(content.url);
      if (content.thumbnailUrl) {
        await azureStorage.deleteFile(content.thumbnailUrl);
      }
      // Soft delete in database
      await MediaContent.delete(id, req.user.id);
      // Invalidate caches
      await redisCache.invalidate(`media:single:${id}`);
      await redisCache.invalidate("media:list:*");
      res.json({ message: "Media content deleted successfully" });
    } catch (error) {
      console.error("Failed to delete media content:", error);
      res.status(500).json({ error: "Failed to delete media content" });
    }
  }
}
module.exports = MediaContentController;
