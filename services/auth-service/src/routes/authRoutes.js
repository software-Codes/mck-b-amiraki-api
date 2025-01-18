// src/routes/userRoutes.js
const express = require("express");
const router = express.Router();
const userController = require('../controllers/authController');
const { 
    authMiddleware, 
    requireAdmin,
    requireActive
} = require("../middleware/authMiddleware");
const multer = require("multer");

// Configure Multer with file size and type restrictions
const upload = multer({
    dest: "uploads/",
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Public routes
router.post("/register", upload.single("profilePhoto"), userController.register);
router.post("/register-admin", userController.registerAdmin);
router.post("/login", userController.login);

// Protected routes - regular users
router.use(authMiddleware, requireActive);

router.get("/profile", userController.getProfile);
router.put("/profile", upload.single("profilePhoto"), userController.updateProfile);
router.put("/change-password", userController.changePassword);
router.delete("/account", userController.deleteAccount);

// Admin only routes
router.get("/users", requireAdmin, userController.getAllUsers);
router.get("/users/:userId", requireAdmin, userController.getUser);
router.put("/users/:userId", requireAdmin, userController.updateUser);
router.delete("/users/:userId", requireAdmin, userController.deleteUser);

// Error handling for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        return res.status(400).json({
            status: "error",
            message: "File upload error: " + error.message
        });
    } else if (error) {
        return res.status(400).json({
            status: "error",
            message: error.message
        });
    }
    next();
});

module.exports = router;