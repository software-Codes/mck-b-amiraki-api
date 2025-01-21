// announcement-service/src/routes/announcements.js
const express = require('express');
const router = express.Router();
const { verifyAuth } = require('../middlewares/authMiddleware');
const announcementController = require('../controllers/announcementController');
const multer = require('multer');
const path = require('path');

// Configure multer for handling file uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadDir = path.join(__dirname, '../uploads/announcements');
            cb(null, uploadDir); // Save files in "uploads/announcements"
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
            cb(null, `${uniqueSuffix}-${file.originalname}`);
        }
    }),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file size limit
    },
    fileFilter: (req, file, cb) => {
        // Validate file type (images and videos)
        const fileTypes = /jpeg|jpg|png|gif|mp4|avi|mov/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
});

// Middleware for handling multer errors
const handleMulterErrors = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Multer error: ${err.message}` });
    } else if (err) {
        return res.status(400).json({ message: `File upload error: ${err.message}` });
    }
    next();
};

// Protected routes - require admin authentication
router.use(verifyAuth);

// Create a new announcement with file uploads
router.post(
    '/',
    upload.fields([
        { name: 'images', maxCount: 5 },
        { name: 'videos', maxCount: 2 }
    ]),
    handleMulterErrors,
    announcementController.createAnnouncement
);

// // Get all announcements
// router.get('/', announcementController.getAnnouncements);

// // Get a specific announcement by ID
// router.get('/:id', announcementController.getAnnouncement);

// // Update an existing announcement with file uploads
// router.put(
//     '/:id',
//     upload.fields([
//         { name: 'images', maxCount: 5 },
//         { name: 'videos', maxCount: 2 }
//     ]),
//     handleMulterErrors,
//     announcementController.updateAnnouncement
// );

// // Delete an announcement by ID
// router.delete('/:id', announcementController.deleteAnnouncement);

module.exports = router;
