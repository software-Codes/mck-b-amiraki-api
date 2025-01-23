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

class AnnouncementController {
  /**
   * Create a new announcement
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async create(req, res) {
    const logContext = "AnnouncementController:Create";
    try {
      // Validate request body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: "error",
          errors: errors.array(),
        });
      }

      const { title, content, status } = req.body;
      const mediaFiles = req.files || [];

      // Create announcement
      const announcement = await createAnnouncement({
        adminId: req.user.id,
        title,
        content,
        status: status || AnnouncementStatus.DRAFT,
        mediaFiles,
      });

      logger.info(`${logContext} - Announcement created`, {
        announcementId: announcement.id,
        adminId: req.user.id,
      });

      res.status(201).json({
        status: "success",
        data: announcement,
      });
    } catch (error) {
      logger.error(`${logContext} - Announcement creation failed`, {
        error: error.message,
        adminId: req.user.id,
      });
      res.status(500).json({
        status: "error",
        message: "Failed to create announcement",
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
      // Validate request body
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: "error",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { title, content, status } = req.body;
      const newMediaFiles = req.files || [];

      // Update announcement
      const updatedAnnouncement = await updateAnnouncement(
        id,
        req.user.id,
        { title, content, status },
        newMediaFiles
      );

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

      // Delete announcement
      await deleteAnnouncement(id, req.user.id);

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
   * Retrieve announcements with pagination
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async list(req, res) {
    const logContext = "AnnouncementController:List";
    try {
      const {
        page = 1,
        limit = 10,
        status = AnnouncementStatus.PUBLISHED,
      } = req.query;

      // Retrieve announcements
      const announcements = await getAnnouncements(
        parseInt(page),
        parseInt(limit),
        status
      );

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

  /**
   * Cleanup old announcements
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  static async cleanup(req, res) {
    const logContext = "AnnouncementController:Cleanup";
    try {
      const { retentionDays = 14, status = AnnouncementStatus.PUBLISHED } =
        req.body;

      // Cleanup old announcements
      const cleanupResult = await cleanupOldAnnouncements({
        retentionDays,
        status,
      });

      logger.info(
        `${logContext} - Announcements cleanup completed`,
        cleanupResult
      );

      res.status(200).json({
        status: "success",
        data: cleanupResult,
      });
    } catch (error) {
      logger.error(`${logContext} - Failed to cleanup announcements`, {
        error: error.message,
      });
      res.status(500).json({
        status: "error",
        message: "Failed to cleanup old announcements",
      });
    }
  }
}

module.exports = AnnouncementController;
