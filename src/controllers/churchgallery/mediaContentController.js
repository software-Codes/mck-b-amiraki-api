const multer = require("multer");
const { validationResult } = require("express-validator");
const { MediaContent } = require("../../models/churchgallery/MediaContent");
const {
  AzureStorageService,
} = require("../../models/churchgallery/azureStorage");
const { RedisService } = require("../../models/churchgallery/redisCache");

// Configure multer for memory storage
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    image: ["image/jpeg", "image/png", "image/gif"],
    video: ["video/mp4", "video/mpeg", "video/quicktime"],
  };

  // Determine content type from actual file mimetype
  const contentType = file.mimetype.startsWith("image/") ? "image" : "video";

  if (allowedTypes[contentType]?.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type"), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
  fileFilter,
}).single("file"); // Ensure this matches client's field name

// Initialize services
const azureStorageService = new AzureStorageService();
const redisService = new RedisService();

class MediaContentController {
  static async uploadContent(req, res) {
    try {
      // Handle file upload
      await new Promise((resolve, reject) => {
        upload(req, res, (err) => {
          if (err) reject(new Error(`Upload error: ${err.message}`));
          else resolve();
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

      // Determine content type from mimetype
      const contentType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';

      // Upload to Azure
      const url = await azureStorageService.uploadFile(req.file, contentType);

      // Handle thumbnail
      let thumbnailUrl = null;
      if (contentType === "video" && req.body.thumbnailBase64) {
        const thumbnailBuffer = Buffer.from(req.body.thumbnailBase64, 'base64');
        thumbnailUrl = await azureStorageService.uploadFile(
          {
            buffer: thumbnailBuffer,
            mimetype: "image/jpeg",
            originalname: `thumbnail-${Date.now()}.jpg`
          },
          "thumbnails"
        );
      }

      // Create database record without duration requirement
      const mediaContent = await MediaContent.create({
        title: req.body.title,
        description: req.body.description,
        contentType,
        url,
        thumbnailUrl,
        uploadedBy: req.user.id,
        size: req.file.size,
        // Duration is now optional and defaults to null
      });

      await redisService.invalidate("media:list:*");
      res.status(201).json(mediaContent);
    } catch (error) {
      console.error("Failed to upload media content:", error);
      res.status(500).json({ 
        error: "Failed to upload media content",
        details: error.message 
      });
    }
  }

  static async getAllContent(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const contentType = req.query.contentType;

      const cacheKey = `media:list:${page}:${limit}:${contentType || "all"}`;
      const cachedData = await redisService.get(cacheKey);

      if (cachedData) {
        return res.json(cachedData);
      }

      const mediaContents = await MediaContent.findAll({
        page,
        limit,
        contentType,
      });

      await redisService.set(cacheKey, mediaContents);
      res.json(mediaContents);
    } catch (error) {
      console.error("Failed to get media content:", error);
      res.status(500).json({ error: "Failed to get media content" });
    }
  }

  static async getContentById(req, res) {
    try {
      const { id } = req.params;
      const cacheKey = `media:single:${id}`;
      const cachedData = await redisService.get(cacheKey);

      if (cachedData) {
        return res.json(cachedData);
      }

      const mediaContent = await MediaContent.findById(id);
      if (!mediaContent) {
        return res.status(404).json({ error: "Media content not found" });
      }

      await MediaContent.updateViewCount(id);
      await redisService.set(cacheKey, mediaContent);
      res.json(mediaContent);
    } catch (error) {
      console.error("Failed to get media content:", error);
      res.status(500).json({ error: "Failed to get media content by id" });
    }
  }

  static async deleteContent(req, res) {
    try {
      const { id } = req.params;
      const content = await MediaContent.findById(id);

      if (!content) {
        return res.status(404).json({ error: "Media content not found" });
      }

      await azureStorageService.deleteFile(content.url);
      if (content.thumbnailUrl) {
        await azureStorageService.deleteFile(content.thumbnailUrl);
      }

      await MediaContent.delete(id, req.user.id);
      await redisService.invalidate(`media:single:${id}`);
      await redisService.invalidate("media:list:*");

      res.json({ message: "Media content deleted successfully" });
    } catch (error) {
      console.error("Failed to delete media content:", error);
      res.status(500).json({ error: "Failed to delete media content" });
    }
  }
}

module.exports = MediaContentController;
