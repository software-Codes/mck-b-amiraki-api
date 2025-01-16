// src/routes/authRoutes.js
const express = require("express");
const { body, param, query } = require("express-validator");
const {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  updateProfilePhoto,
  deleteAccount,
} = require("../controllers/authController");
const {
  authMiddleware,
  requireVerified,
  requireAdmin,
} = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const router = express.Router();
const { validationResult } = require("express-validator");

// Custom validation middleware
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    res.status(400).json({
      status: "error",
      errors: errors.array(),
    });
  };
};

// Validation schemas
const validations = {
  register: [
    body("fullName")
      .trim()
      .notEmpty()
      .withMessage("Full name is required")
      .isLength({ min: 2, max: 100 })
      .withMessage("Full name must be between 2 and 100 characters"),

    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Invalid email address")
      .normalizeEmail(),

    body("password")
      .notEmpty()
      .withMessage("Password is required")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long")
      .matches(/\d/)
      .withMessage("Password must contain a number")
      .matches(/[A-Z]/)
      .withMessage("Password must contain an uppercase letter")
      .matches(/[a-z]/)
      .withMessage("Password must contain a lowercase letter")
      .matches(/[!@#$%^&*(),.?":{}|<>]/)
      .withMessage("Password must contain a special character"),

    body("phoneNumber")
      .optional()
      .matches(/^\+?[\d\s-]+$/)
      .withMessage("Invalid phone number format"),

    body("confirmPassword").custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Password confirmation does not match password");
      }
      return true;
    }),
  ],

  login: [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Invalid email address")
      .normalizeEmail(),

    body("password").notEmpty().withMessage("Password is required"),
  ],

  updateProfile: [
    body("fullName")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Full name must be between 2 and 100 characters"),

    body("phoneNumber")
      .optional()
      .matches(/^\+?[\d\s-]+$/)
      .withMessage("Invalid phone number format"),
  ],

  changePassword: [
    body("currentPassword")
      .notEmpty()
      .withMessage("Current password is required"),

    body("newPassword")
      .notEmpty()
      .withMessage("New password is required")
      .isLength({ min: 8 })
      .withMessage("New password must be at least 8 characters long")
      .matches(/\d/)
      .withMessage("New password must contain a number")
      .matches(/[A-Z]/)
      .withMessage("New password must contain an uppercase letter")
      .matches(/[a-z]/)
      .withMessage("New password must contain a lowercase letter")
      .matches(/[!@#$%^&*(),.?":{}|<>]/)
      .withMessage("New password must contain a special character")
      .custom((value, { req }) => {
        if (value === req.body.currentPassword) {
          throw new Error(
            "New password must be different from current password"
          );
        }
        return true;
      }),

    body("confirmNewPassword").custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Password confirmation does not match new password");
      }
      return true;
    }),
  ],
};

// Public routes
router.post(
  "/register",
  upload.single("profilePhoto"),  // This will handle file upload
  validate(validations.register),
  register
);

router.post("/login", validate(validations.login), login);

// Protected routes
router.use(authMiddleware);

// Profile routes
router.get("/profile", getProfile);

router.put(
  "/profile",
  validate(validations.updateProfile),
  updateProfile
);

router.put(
  "/profile/photo",
  upload.single("profilePhoto"),  // This will handle file upload
  updateProfilePhoto
);

// Password routes
router.put(
  "/password",
  validate(validations.changePassword),
  changePassword
);

// Export router
module.exports = router;
