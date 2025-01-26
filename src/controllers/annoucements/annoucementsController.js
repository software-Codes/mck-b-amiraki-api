const {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  cleanupOldAnnouncements,
  pinAnnouncement,
  unpinAnnouncement,
  AnnouncementStatus,
} = require("../../models/annoucements/annoucementsModel");
const logger = require("../../config/logger");
const { validationResult } = require("express-validator");
const redis = require("../../config/redis");

class AnnouncementController {
  /**
   * Create a new announcement
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async create(req, res) {
    try {
      const { title, content } = req.body;
      const adminId = req.user.id;  // Assuming authenticated admin
  
      const announcement = await createAnnouncement({
        adminId,
        title,
        content
      });
  
      res.status(201).json({
        message: "Announcement published successfully",
        announcementId: announcement.id,

      });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to publish announcement",
        error: error.message 
      });
    }
  };

  /**
   * Retrieve announcements with pagination and caching
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async list(req, res) {
    const logContext = "AnnouncementController:List";
    try {
      const { page = 1, limit = 10, status = AnnouncementStatus.PUBLISHED } = req.query;
      const cacheKey = `announcements:list:${status}:${page}:${limit}`;

      // Try to get cached data first
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return res.status(200).json({
          status: "success",
          data: JSON.parse(cachedData),
          meta: { page: parseInt(page), limit: parseInt(limit), status },
          fromCache: true,
        });
      }

      // If not in cache, fetch from database
      const announcements = await getAnnouncements(
        parseInt(page),
        parseInt(limit),
        status
      );

      // Cache the result for 1 hour
      await redis.setex(cacheKey, 3600, JSON.stringify(announcements));

      res.status(200).json({
        status: "success",
        data: announcements,
        meta: {
          page: parseInt(page),
          limit: parseInt(limit),
          status,
        },
      });
    } catch (error) {
      logger.error(`${logContext} - Failed to retrieve announcements`, {
        error: error.message,
      });
      res.status(500).json({
        status: "error",
        message: "Failed to retrieve announcements",
      });
    }
  }

  /**
   * Update an existing announcement
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async update(req, res) {
    const logContext = "AnnouncementController:Update";
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: "error",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { title, content, status } = req.body;

      const updatedAnnouncement = await updateAnnouncement(
        id,
        req.user.id,
        { title, content, status }
      );

      // Clear relevant caches
      await redis.del(`announcements:list:*`);
      await redis.del(`announcement:${id}`);

      logger.info(`${logContext} - Announcement updated`, {
        announcementId: id,
        adminId: req.user.id,
      });

      res.status(200).json({
        status: "success",
        data: updatedAnnouncement,
      });
    } catch (error) {
      logger.error(`${logContext} - Announcement update failed`, {
        error: error.message,
        adminId: req.user.id,
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update announcement",
      });
    }
  }

  /**
   * Delete an announcement
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async delete(req, res) {
    const logContext = "AnnouncementController:Delete";
    try {
      const { id } = req.params;
      await deleteAnnouncement(id, req.user.id);

      // Clear relevant caches
      await redis.del(`announcements:list:*`);
      await redis.del(`announcement:${id}`);

      logger.info(`${logContext} - Announcement deleted`, {
        announcementId: id,
        adminId: req.user.id,
      });

      res.status(200).json({
        status: "success",
        message: "Announcement deleted successfully",
      });
    } catch (error) {
      logger.error(`${logContext} - Announcement deletion failed`, {
        error: error.message,
        adminId: req.user.id,
      });
      res.status(500).json({
        status: "error",
        message: "Failed to delete announcement",
      });
    }
  }

  /**
   * Cleanup old announcements
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async cleanup(req, res) {
    const logContext = "AnnouncementController:Cleanup";
    try {
      const { retentionDays = 14, status = AnnouncementStatus.PUBLISHED } = req.body;
      const cleanupResult = await cleanupOldAnnouncements({ retentionDays, status });

      // Clear relevant caches
      await redis.del(`announcements:list:${status}:*`);

      logger.info(`${logContext} - Cleanup completed`, cleanupResult);
      res.status(200).json({
        status: "success",
        data: cleanupResult,
      });
    } catch (error) {
      logger.error(`${logContext} - Cleanup failed`, { error: error.message });
      res.status(500).json({
        status: "error",
        message: "Failed to cleanup announcements",
      });
    }
  }

  /**
   * Pin an announcement
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async pin(req, res) {
    const logContext = "AnnouncementController:Pin";
    try {
      const { id } = req.params;

      // Pin announcement
      const pinnedAnnouncement = await pinAnnouncement(id, req.user.id);

      logger.info(`${logContext} - Announcement pinned`, {
        announcementId: id,
        adminId: req.user.id,
      });

      res.status(200).json({
        status: "success",
        data: pinnedAnnouncement,
      });
    } catch (error) {
      logger.error(`${logContext} - Failed to pin announcement`, {
        error: error.message,
        adminId: req.user.id,
      });
      res.status(500).json({
        status: "error",
        message: "Failed to pin announcement",
      });
    }
  }

  /**
   * Unpin an announcement
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async unpin(req, res) {
    const logContext = "AnnouncementController:Unpin";
    try {
      const { id } = req.params;

      // Unpin announcement
      const unpinnedAnnouncement = await unpinAnnouncement(id, req.user.id);

      logger.info(`${logContext} - Announcement unpinned`, {
        announcementId: id,
        adminId: req.user.id,
      });

      res.status(200).json({
        status: "success",
        data: unpinnedAnnouncement,
      });
    } catch (error) {
      logger.error(`${logContext} - Failed to unpin announcement`, {
        error: error.message,
        adminId: req.user.id,
      });
      res.status(500).json({
        status: "error",
        message: "Failed to unpin announcement",
      });
    }
  }

}

module.exports = AnnouncementController;
