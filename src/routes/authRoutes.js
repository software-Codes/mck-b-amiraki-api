const express = require("express");
const router = express.Router();
const userController = require("../controllers/authController"); // Changed from authController to match your controller
const {
  authMiddleware,
  requireAdmin,
  requireActive,
  requireSuperAdmin,
  sensitiveOperationsMiddleware,
} = require("../middleware/authMiddleware");
const { check } = require("express-validator");
const multer = require("multer");

// Configure Multer with file size and type restrictions
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// Input validation middleware
const registerValidation = [
  check("fullName").trim().notEmpty().withMessage("Full name is required"),
  check("email").isEmail().withMessage("Valid email is required"),
  check("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),
  check("phoneNumber").notEmpty().withMessage("Phone number is required"),
];

const loginValidation = [
  check("email").isEmail().withMessage("Valid email is required"),
  check("password").notEmpty().withMessage("Password is required"),
];

const adminRegisterValidation = [
  check("fullName").trim().notEmpty().withMessage("Full name is required"),
  check("email").isEmail().withMessage("Valid email is required"),
  check("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),
  check("phoneNumber").notEmpty().withMessage("Phone number is required"),
];

const adminVerificationValidation = [
  check("email").isEmail().withMessage("Valid email is required"),
  check("verificationCode")
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage("Valid 6-digit verification code is required"),
];

const updateProfileValidation = [
  check("fullName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Full name cannot be empty if provided"),
  check("phoneNumber")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Phone number cannot be empty if provided"),
];

const changePasswordValidation = [
  check("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  check("newPassword")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters long"),
];

// Public routes
router.post(
  "/register",
  registerValidation,
  upload.single("profilePhoto"),
  userController.register
);

router.post("/login", loginValidation, userController.login);

router.post("/refresh-token", userController.refreshToken);

// Admin registration routes
router.post(
  "/register-admin",
  adminRegisterValidation,
  userController.registerAdmin
);

router.post(
  "/verify-admin",
  adminVerificationValidation,
  userController.verifyAdmin
);

// All protected routes below this middleware
router.use(authMiddleware, requireActive);

// Regular user routes
router.get("/profile", userController.getProfile);

router.put(
  "/profile",
  updateProfileValidation,
  upload.single("profilePhoto"),
  userController.updateProfile
);

// router.post(
//   "/upload-profile-photo",
//   upload.single("profilePhoto"),
//   userController.uploadProfilePhoto
// );

router.put(
  "/change-password",
  changePasswordValidation,
  sensitiveOperationsMiddleware,
  userController.changePassword
);

// Self-account deletion route
router.delete(
  "/account",
  sensitiveOperationsMiddleware,
  userController.deleteAccount
);

// Token management
router.post("/logout", userController.logout);
router.post("/revoke-token", userController.revokeToken);

// Admin routes
router.get("/users", requireAdmin, userController.getAllUsers);
router.get("/users/:userId", requireAdmin, userController.getUser);
router.put("/users/:userId", requireAdmin, userController.updateUser);

// Super admin only routes
router.post(
  "/create-admin",
  requireAdmin,
  requireSuperAdmin,
  adminRegisterValidation,
  userController.registerAdmin
);

// Error handling for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      status: "error",
      message: "File upload error: " + error.message,
    });
  } else if (error) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
  next();
});

module.exports = router;
