const express = require("express"); 
const AnnouncementController = require('../../controllers/annoucements/annoucementsController');
const { body, param, query } = require("express-validator");
const {
  authMiddleware,
  requireAdmin,
  requireSuperAdmin,
} = require("../../middleware/authMiddleware");
const multer = require("multer");

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
    files: 5, // Maximum 5 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "video/mp4",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"), false);
    }
  },
});

const announcementRoutes = express.Router();

// Validation middleware for announcement creation
const createAnnouncementValidation = [
  body("title")
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Title must be between 3 and 255 characters"),
  body("content")
    .trim()
    .isLength({ min: 10 })
    .withMessage("Content must be at least 10 characters long"),
  body("status")
    .optional()
    .isIn(["draft", "published", "archived"])
    .withMessage("Invalid announcement status"),
];

// Validation middleware for announcement update
const updateAnnouncementValidation = [
  param("id").isInt().withMessage("Invalid announcement ID"),
  body("title")
    .optional()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage("Title must be between 3 and 255 characters"),
  body("content")
    .optional()
    .trim()
    .isLength({ min: 10 })
    .withMessage("Content must be at least 10 characters long"),
  body("status")
    .optional()
    .isIn(["draft", "published", "archived"])
    .withMessage("Invalid announcement status"),
];

// Announcement Routes
announcementRoutes.post(
  "/",
  authMiddleware,
  requireAdmin,
  upload.array("media", 5),
  createAnnouncementValidation,
  AnnouncementController.create
);

announcementRoutes.put(
  "/:id",
  authMiddleware,
  requireAdmin,
  upload.array("media", 5),
  updateAnnouncementValidation,
  AnnouncementController.update
);

announcementRoutes.delete(
  "/:id",
  authMiddleware,
  requireAdmin,
  AnnouncementController.delete
);

announcementRoutes.get(
  "/",
  authMiddleware,
  [
    query("page").optional().isInt().toInt(),
    query("limit").optional().isInt().toInt(),
    query("status").optional().isIn(["draft", "published", "archived", "pinned", "all"]),
  ],
  AnnouncementController.getAll
);

announcementRoutes.post(
  "/:id/pin",
  authMiddleware,
  requireSuperAdmin,
  param("id").isInt().withMessage("Invalid announcement ID"),
  AnnouncementController.pin
);

announcementRoutes.post(
  "/:id/unpin",
  authMiddleware,
  requireSuperAdmin,
  param("id").isInt().withMessage("Invalid announcement ID"),
  AnnouncementController.unpin
);

announcementRoutes.post(
  "/cleanup",
  authMiddleware,
  requireSuperAdmin,
  [
    body("retentionDays").optional().isInt(),
    body("status").optional().isIn(["draft", "published", "archived"]),
  ],
  AnnouncementController.cleanup
);

module.exports = announcementRoutes;
