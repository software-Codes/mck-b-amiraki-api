const AnnouncementModel = require('../models/announcementModel');

const AnnouncementController = {
  // Create a new announcement
  createAnnouncement: async (req, res) => {
    try {
      const { title, content, mediaUrls, createdBy, type } = req.body;

      // Validate input
      if (!title || !content || !createdBy || !type) {
        return res.status(400).json({ message: "All required fields must be filled." });
      }

      const newAnnouncement = await AnnouncementModel.create({
        title,
        content,
        mediaUrls,
        createdBy,
        type
      });

      res.status(201).json({
        message: "Announcement created successfully.",
        data: newAnnouncement
      });
    } catch (error) {
      console.error("Error creating announcement:", error);
      res.status(500).json({ message: "Internal server error." });
    }
  },

  // Get all announcements
  getAllAnnouncements: async (req, res) => {
    try {
      const announcements = await AnnouncementModel.findAll();
      res.status(200).json({
        message: "Announcements retrieved successfully.",
        data: announcements
      });
    } catch (error) {
      console.error("Error retrieving announcements:", error);
      res.status(500).json({ message: "Internal server error." });
    }
  }

  // Add more controller methods as needed (e.g., updateAnnouncement, deleteAnnouncement)
};

module.exports = AnnouncementController;
