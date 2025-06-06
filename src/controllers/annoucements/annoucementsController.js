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

/**
 * Controller class for managing announcements
 * This class handles CRUD operations for announcements, including creating,
 * retrieving, updating, deleting, and managing announcement status.
 */
class AnnouncementController {
  /**
   * Create a new announcement
   * @param {Object} req - Express request object containing announcement data
   * @param {Object} res - Express response object
   * @returns {Promise} - Resolves with announcement creation response
   */
  static async create(req, res) {
    try {
      const { title, content } = req.body;
      const adminId = req.user.id; // Assuming authenticated admin

      const announcement = await createAnnouncement({
        adminId,
        title,
        content,
      });

      res.status(201).json({
        message: "Announcement published successfully",
        announcementId: announcement.id,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to publish announcement",
        error: error.message,
      });
    }
  }

  /**
   * Retrieve announcements with pagination
   * @param {Object} req - Express request object containing pagination parameters
   * @param {Object} res - Express response object
   * @returns {Promise} - Resolves with announcement list
   */
  static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const status = req.query.status || AnnouncementStatus.PUBLISHED;

      // Validate input
      if (page < 1 || limit < 1 || limit > 100) {
        return res.status(400).json({
          status: "error",
          message: "Invalid pagination parameters",
        });
      }

      const result = await getAnnouncements(page, limit, status);

      res.status(200).json({
        status: "success",
        data: result,
        meta: {
          page,
          limit,
          status,
        },
      });
    } catch (error) {
      console.error("Fetch Announcements Controller Error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch announcements",
        error: error.message,
      });
    }
  }

  /**
   * Update an existing announcement
   * @param {Object} req - Express request object containing update data
   * @param {Object} res - Express response object
   * @returns {Promise} - Resolves with updated announcement
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { title, content, status } = req.body;
      const adminId = req.user.id;

      // Prepare update data
      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (status !== undefined) updateData.status = status;

      const updatedAnnouncement = await updateAnnouncement(
        id,
        adminId,
        updateData
      );

      res.status(200).json({
        status: "success",
        data: updatedAnnouncement,
      });
    } catch (error) {
      console.error("Update Controller Error:", error);
      res.status(500).json({
        status: "error",
        message: error.message || "Failed to update announcement",
      });
    }
  }

  /**
   * Delete an announcement
   * @param {Object} req - Express request object containing announcement ID
   * @param {Object} res - Express response object
   * @returns {Promise} - Resolves with deletion confirmation
   */
  static async delete(req, res) {
    const logContext = "AnnouncementController:Delete";
    try {
      const { id } = req.params;
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
   * Cleanup old announcements based on retention policy
   * @param {Object} req - Express request object containing cleanup parameters
   * @param {Object} res - Express response object
   * @returns {Promise} - Resolves with cleanup results
   */
  static async cleanup(req, res) {
    const logContext = "AnnouncementController:Cleanup";
    try {
      const { retentionDays = 14, status = AnnouncementStatus.PUBLISHED } = req.body;
      const cleanupResult = await cleanupOldAnnouncements({
        retentionDays,
        status,
      });

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
   * Pin an announcement to make it appear at the top
   * @param {Object} req - Express request object containing announcement ID
   * @param {Object} res - Express response object
   * @returns {Promise} - Resolves with pinned announcement
   */
  static async pin(req, res) {
    const logContext = "AnnouncementController:Pin";
    try {
      const { id } = req.params;

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
   * Unpin an announcement to remove it from the top position
   * @param {Object} req - Express request object containing announcement ID
   * @param {Object} res - Express response object
   * @returns {Promise} - Resolves with unpinned announcement
   */
  static async unpin(req, res) {
    const logContext = "AnnouncementController:Unpin";
    try {
      const { id } = req.params;

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