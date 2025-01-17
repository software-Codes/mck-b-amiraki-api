// src/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  updateProfilePhoto,
  verifyPhone,
  resendVerificationCode,
  deleteAccount,
} = require("../controllers/authController");

const {
  authMiddleware,
  requireVerified,
  requireAdmin,
} = require("../middleware/authMiddleware");

const {
  validate,
  registerValidation,
  loginValidation,
  updateProfileValidation,
  changePasswordValidation,
  verifyPhoneValidation
} = require("../middleware/validationMiddleware");

const upload = require("../middleware/upload");

// Public routes
router.post(
  "/register",
  upload.single("profilePhoto"),
  validate(registerValidation),
  register
);

router.post(
  "/login", 
  validate(loginValidation), 
  login
);

// Protected routes
router.use(authMiddleware);

// Verification routes
router.post(
  "/verify-phone",
  validate(verifyPhoneValidation),
  verifyPhone
);

router.post(
  "/resend-verification",
  resendVerificationCode
);

// Protected routes that require verification
router.use(requireVerified);

// Profile routes
router.get(
  "/profile", 
  getProfile
);

router.put(
  "/profile",
  validate(updateProfileValidation),
  updateProfile
);

router.put(
  "/profile/photo",
  upload.single("profilePhoto"),
  updateProfilePhoto
);

// Password routes
router.put(
  "/password",
  validate(changePasswordValidation),
  changePassword
);

// Admin routes
router.delete(
  "/users/:userId",
  requireAdmin,
  deleteAccount
);

module.exports = router;