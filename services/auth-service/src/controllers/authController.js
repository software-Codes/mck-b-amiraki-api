// src/controllers/authController.js
const userModel = require("../models/userModel");
const { validationResult } = require("express-validator");
const logger = require("../config/logger");

/**
 * Generate a unique admin registration code
 * @returns {string} Unique registration code
 */
const generateAdminCode = () => {
  return crypto.randomBytes(16).toString("hex");
};

/**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing user details
 * @param {string} req.body.fullName - User's full name
 * @param {string} req.body.email - User's email
 * @param {string} req.body.password - User's password
 * @param {string} req.body.phoneNumber - User's phone number
 * @param {string} [req.body.adminCode] - Admin registration code (if registering as admin)
 * @param {Object} [req.file] - Uploaded profile photo
 * @param {Object} res - Express response object
 */

// Register a new user
const register = async (req, res) => {
    const logContext = `AuthController.register: ${req.body.email}`;
  
    try {
      logger.info(`${logContext} - Starting user registration`);
  
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn(`${logContext} - Validation errors`, {
          errors: errors.array(),
        });
        return res.status(400).json({
          status: "error",
          errors: errors.array(),
        });
      }
  
      const { fullName, email, password, phoneNumber, adminCode } = req.body;
      const profilePhoto = req.file;
  
      // Format phone number to E.164 format
      const formattedPhoneNumber = phoneNumber.startsWith('+') ? 
        phoneNumber : 
        phoneNumber.startsWith('0') ? 
          `+254${phoneNumber.slice(1)}` : 
          `+${phoneNumber}`;
  
      // Handle admin registration
      let isAdmin = false;
      if (adminCode) {
        const isValidAdminCode = await userModel.verifyAdminCode(adminCode);
        if (!isValidAdminCode) {
          logger.warn(`${logContext} - Invalid admin registration code`);
          return res.status(403).json({
            status: "error",
            message: "Invalid admin registration code",
          });
        }
        isAdmin = true;
        logger.info(`${logContext} - Admin registration verified`);
      }
  
      const user = await userModel.createUnverifiedUser({
        fullName,
        email,
        password,
        phoneNumber: formattedPhoneNumber,
        profilePhoto,
        isAdmin,
      });
  
      logger.info(`${logContext} - User pre-registered successfully`, {
        userId: user.id,
      });
  
      res.status(201).json({
        status: "success",
        message: "Pre-registration successful. Please verify your phone number to activate your account.",
        data: {
          userId: user.id,
          status: 'pending',
          phoneNumber: formattedPhoneNumber
        }
      });
    } catch (error) {
      logger.error(`${logContext} - Registration failed`, {
        error: error.message,
      });
      res.status(400).json({
        status: "error",
        message: error.message,
      });
    }
  };
  
  const verifyPhone = async (req, res) => {
    const logContext = `AuthController.verifyPhone: ${req.params.userId}`;
    
    try {
      logger.info(`${logContext} - Attempting phone verification`);
      
      const { userId } = req.params;
      const { code } = req.body;
      
      const verifiedUser = await userModel.verifyPhoneNumber(userId, code);
  
      logger.info(`${logContext} - Phone verification successful`);
  
      res.status(200).json({
        status: "success",
        message: "Phone number verified successfully. You can now log in.",
        data: {
          userId: verifiedUser.id,
          status: verifiedUser.status
        }
      });
    } catch (error) {
      logger.error(`${logContext} - Phone verification failed`, {
        error: error.message,
      });
      res.status(400).json({
        status: "error",
        message: error.message,
      });
    }
  };



// Resend verification code
const resendVerificationCode = async (req, res) => {
  try {
    await userModel.resendVerificationCode(req.user.id);

    res.status(200).json({
      status: "success",
      message: "Verification code resent successfully",
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

// Login user

/**
 * Authenticate user login
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User's email
 * @param {string} req.body.password - User's password
 * @param {Object} res - Express response object
 */
const login = async (req, res) => {
  const logContext = `AuthController.login: ${req.body.email}`;

  try {
    logger.info(`${logContext} - Attempting login`);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(`${logContext} - Validation errors`, {
        errors: errors.array(),
      });
      return res.status(400).json({
        status: "error",
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;
    const { user, token } = await userModel.loginUser(email, password);

    // Check if user is verified
    if (!user.is_verified) {
      logger.warn(`${logContext} - Unverified user attempting to login`);
      return res.status(403).json({
        status: "error",
        message: "Please verify your phone number before logging in",
        needsVerification: true,
      });
    }

    logger.info(`${logContext} - Login successful`, { userId: user.id });

    // Set token in HTTP-only cookie for better security
    res.cookie("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.status(200).json({
      status: "success",
      message: "Login successful",
      data: {
        user,
        token, // Still sending token in response for client-side storage if needed
      },
    });
  } catch (error) {
    logger.error(`${logContext} - Login failed`, { error: error.message });
    res.status(401).json({
      status: "error",
      message: error.message,
    });
  }
};

/**
 * Generate new admin registration code
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const generateAdminRegistrationCode = async (req, res) => {
  const logContext = `AuthController.generateAdminCode: ${req.user.id}`;

  try {
    logger.info(`${logContext} - Generating new admin registration code`);

    // Verify the requesting user is a super admin
    if (!req.user.is_super_admin) {
      logger.warn(
        `${logContext} - Unauthorized attempt to generate admin code`
      );
      return res.status(403).json({
        status: "error",
        message: "Only super admins can generate admin registration codes",
      });
    }

    const adminCode = generateAdminCode();
    await userModel.storeAdminCode(adminCode);

    logger.info(
      `${logContext} - Admin registration code generated successfully`
    );

    res.status(200).json({
      status: "success",
      message: "Admin registration code generated",
      data: { adminCode },
    });
  } catch (error) {
    logger.error(`${logContext} - Failed to generate admin code`, {
      error: error.message,
    });
    res.status(500).json({
      status: "error",
      message: "Failed to generate admin registration code",
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await userModel.findUserById(req.user.id);
    res.status(200).json({
      status: "success",
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: "error",
        errors: errors.array(),
      });
    }

    const updates = {
      fullName: req.body.fullName,
      phoneNumber: req.body.phoneNumber,
    };

    const user = await userModel.updateUser(req.user.id, updates);

    res.status(200).json({
      status: "success",
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: "error",
        errors: errors.array(),
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const user = await userModel.findUserById(req.user.id);
    const isValidPassword = await userModel.verifyPassword(
      currentPassword,
      user.password
    );

    if (!isValidPassword) {
      return res.status(401).json({
        status: "error",
        message: "Current password is incorrect",
      });
    }

    await userModel.updatePassword(req.user.id, newPassword);

    res.status(200).json({
      status: "success",
      message: "Password updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

// Upload/update profile photo
const updateProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "Please upload a file",
      });
    }

    const user = await userModel.updateProfilePhoto(req.user.id, req.file);

    res.status(200).json({
      status: "success",
      message: "Profile photo updated successfully",
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

//delete user profile
const deleteAccount = async (req, res) => {
  try {
    const { userId } = req.params;

    // Logic to delete user from database
    const deletedUser = await userModel.deleteUser(userId);

    if (!deletedUser) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    res.status(200).json({
      status: "success",
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
    register,
    login,
    verifyPhone,
    resendVerificationCode,
    getProfile,
    updateProfile,
    changePassword,
    updateProfilePhoto,
    deleteAccount,
    generateAdminRegistrationCode
};
