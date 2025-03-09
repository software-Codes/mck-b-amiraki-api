const multer = require("multer");
const { validationResult } = require("express-validator");
const { MediaContent } = require("../../models/churchgallery/MediaContent");
const {
  AzureStorageService,
} = require("../../models/churchgallery/azureStorage");

// Configure multer for memory storage
const storage = multer.memoryStorage();

// Configure file filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    image: ["image/jpeg", "image/png", "image/gif"],
    video: ["video/mp4", "video/mpeg", "video/quicktime"],
  };

  const contentType = file.mimetype.startsWith("image/") ? "image" : "video";

  if (allowedTypes[contentType]?.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}`), false);
  }
};

// Configure multer upload
const upload = multer({
  storage,
  fileFilter,
}).array("mediaFiles", 50); // Allow up to 50 files per request

// Initialize services
const azureStorageService = new AzureStorageService();

/**
 * Controller class for handling media content operations
 * This controller manages the upload, retrieval, and deletion of media content
 * including both images and videos, with storage in Azure and metadata in database
 */
class MediaContentController {
  /**
   * Handles multiple file uploads to Azure Storage and database storage
   * @param {Object} req - Express request object containing files and metadata
   * @param {Object} res - Express response object for sending responses
   * @returns {Promise} - Resolves with upload results or rejects with error
   */
  static async uploadMultipleContent(req, res) {
    try {
      // Handle file upload using multer
      await new Promise((resolve, reject) => {
        upload(req, res, (err) => {
          if (err) {
            if (err.code === "LIMIT_UNEXPECTED_FILE") {
              reject(
                new Error('The field name for files should be "mediaFiles"')
              );
            } else {
              reject(new Error(`Upload error: ${err.message}`));
            }
          } else {
            resolve();
          }
        });
      });

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      // Process each file and upload to Azure
      const uploadResults = await Promise.allSettled(
        req.files.map(async (file, index) => {
          try {
            const contentType = file.mimetype.startsWith("image/")
              ? "image"
              : "video";
            const url = await azureStorageService.uploadFile(file, contentType);

            let thumbnailUrl = null;
            if (contentType === "video" && req.body.thumbnails?.[index]) {
              const thumbnailBuffer = Buffer.from(
                req.body.thumbnails[index],
                "base64"
              );
              thumbnailUrl = await azureStorageService.uploadFile(
                {
                  buffer: thumbnailBuffer,
                  mimetype: "image/jpeg",
                  originalname: `thumbnail-${Date.now()}.jpg`,
                },
                "thumbnails"
              );
            }

            // Create database record
            const mediaContent = await MediaContent.create({
              title: Array.isArray(req.body.titles)
                ? req.body.titles[index]
                : `Upload ${index + 1}`,
              description: Array.isArray(req.body.descriptions)
                ? req.body.descriptions[index]
                : "",
              contentType,
              url,
              thumbnailUrl,
              uploadedBy: req.user.id,
              size: file.size,
            });

            return {
              success: true,
              data: mediaContent,
              originalName: file.originalname,
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
              originalName: file.originalname,
            };
          }
        })
      );

      // Process results
      const successfulUploads = uploadResults
        .filter(
          (result) => result.status === "fulfilled" && result.value.success
        )
        .map((result) => result.value.data);

      const failedUploads = uploadResults
        .filter(
          (result) => result.status === "rejected" || !result.value.success
        )
        .map((result) => ({
          file: result.value?.originalName,
          error:
            result.status === "rejected" ? result.reason : result.value.error,
        }));

      // Send response with detailed upload results
      res.status(207).json({
        message: "Upload process completed",
        successful: successfulUploads,
        failed: failedUploads,
        totalProcessed: uploadResults.length,
        successCount: successfulUploads.length,
        failureCount: failedUploads.length,
      });
    } catch (error) {
      console.error("Failed to process multiple uploads:", error);
      res.status(500).json({
        error: "Failed to process multiple uploads",
        details: error.message,
      });
    }
  }

  /**
   * Retrieves paginated list of media content from database
   * @param {Object} req - Express request object containing pagination parameters
   * @param {Object} res - Express response object for sending responses
   * @returns {Promise} - Resolves with media content list or rejects with error
   */
  static async getAllContent(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const contentType = req.query.contentType;

      // Fetch media content directly from database
      const mediaContents = await MediaContent.findAll({
        page,
        limit,
        contentType,
      });

      res.json(mediaContents);
    } catch (error) {
      console.error("Failed to get media content:", error);
      res.status(500).json({ error: "Failed to get media content" });
    }
  }

  /**
   * Retrieves single media content item by ID
   * @param {Object} req - Express request object containing media ID
   * @param {Object} res - Express response object for sending responses
   * @returns {Promise} - Resolves with media content item or rejects with error
   */
  static async getContentById(req, res) {
    try {
      const { id } = req.params;

      const mediaContent = await MediaContent.findById(id);
      if (!mediaContent) {
        return res.status(404).json({ error: "Media content not found" });
      }

      // Update view count for the media content
      await MediaContent.updateViewCount(id);

      res.json(mediaContent);
    } catch (error) {
      console.error("Failed to get media content:", error);
      res.status(500).json({ error: "Failed to get media content by id" });
    }
  }

  /**
   * Deletes media content item and associated files
   * @param {Object} req - Express request object containing media ID
   * @param {Object} res - Express response object for sending responses
   * @returns {Promise} - Resolves with success message or rejects with error
   */
  static async deleteContent(req, res) {
    try {
      const { id } = req.params;
      const content = await MediaContent.findById(id);

      if (!content) {
        return res.status(404).json({ error: "Media content not found" });
      }

      // Delete files from Azure Storage
      await azureStorageService.deleteFile(content.url);
      if (content.thumbnailUrl) {
        await azureStorageService.deleteFile(content.thumbnailUrl);
      }

      // Delete database record
      await MediaContent.delete(id, req.user.id);

      res.json({ message: "Media content deleted successfully" });
    } catch (error) {
      console.error("Failed to delete media content:", error);
      res.status(500).json({ error: "Failed to delete media content" });
    }
  }
}

module.exports = MediaContentController;
