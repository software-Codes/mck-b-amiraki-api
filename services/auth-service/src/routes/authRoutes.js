// src/routes/userRoute.js
const express = require("express");
const router = express.Router();
const userController = require('../controllers/authController');
const { 
  authMiddleware, 
  requireVerified, 
  requireAdmin 
} = require("../middleware/authMiddleware");
const {
  validate,
  registerValidation,
  loginValidation,
  updateProfileValidation,
  changePasswordValidation,
  verifyPhoneValidation
} = require("../middleware/validationMiddleware");
const multer = require("multer");

// Configure Multer for file uploads (e.g., profile photos)
const upload = multer({ dest: "uploads/" });

// Routes

// Register a new user
router.post(
  "/register",
  upload.single("profilePhoto"),
  validate(registerValidation),
  userController.register
);

// Login a user
router.post(
  "/login",
  userController.login
);

// Get user profile (Authenticated users only)
router.get(
  "/profile",
  authMiddleware,
  userController.getProfile
);

// Get all users (Admin only)
router.get(
  "/all",
  authMiddleware,
  requireAdmin,
  userController.getAllUsers
);

// Update user profile (Authenticated users only)
router.put(
  "/profile",
  authMiddleware,
  validate(updateProfileValidation),
  userController.updateProfile
);

// Change password (Authenticated users only)
router.put(
  "/change-password",
  authMiddleware,
  validate(changePasswordValidation),
  userController.changePassword
);

// Delete account (Authenticated users only)
router.delete(
  "/delete-account",
  authMiddleware,
  userController.deleteAccount
);

// Update user status (Admin only)
router.put(
  "/status/:userId",
  authMiddleware,
  requireAdmin,
  userController.updateUserStatus
);

// Optional: Add phone verification route if applicable
router.post(
  "/verify-phone",
  authMiddleware,
  validate(verifyPhoneValidation),
  (req, res) => {
    // Example implementation (to be added if necessary)
    res.status(200).json({
      status: "success",
      message: "Phone verification not implemented yet."
    });
  }
);

module.exports = router;
