// src/controllers/userController.js
const userModel = require("../models/userModel");
const { validationResult } = require("express-validator");
const logger = require("../config/logger");

// Register new user
const register = async (req, res) => {
  const logContext = `UserController.register: ${req.body.email}`;

  try {
    logger.info(`${logContext} - Starting user registration`);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(`${logContext} - Validation errors`, { errors: errors.array() });
      return res.status(400).json({
        status: "error",
        errors: errors.array(),
      });
    }

    const { fullName, email, password, phoneNumber, adminCode } = req.body;
    const profilePhoto = req.file;

    // Handle admin registration if needed
    let isAdmin = false;
    if (adminCode && adminCode === process.env.ADMIN_CODE) {
      isAdmin = true;
    }

    const user = await userModel.createUser({
      fullName,
      email,
      password,
      phoneNumber,
      profilePhoto,
      isAdmin,
    });

    logger.info(`${logContext} - User registered successfully`, {
      userId: user.id,
    });

    res.status(201).json({
      status: "success",
      message: "Registration successful",
      data: user
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

// Login user
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: "error",
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;
    const { user, token } = await userModel.loginUser(email, password);

    res.status(200).json({
      status: "success",
      message: "Login successful",
      data: { user, token },
    });
  } catch (error) {
    res.status(401).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await userModel.getUserById(req.user.id);
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

// Get all users (admin only)
const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const userData = await userModel.getAllUsers(page, limit);
    
    res.status(200).json({
      status: "success",
      data: userData,
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
      email: req.body.email,
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
    await userModel.updatePassword(req.user.id, currentPassword, newPassword);

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

// Delete account
const deleteAccount = async (req, res) => {
  try {
    await userModel.deleteUser(req.user.id);
    
    res.status(200).json({
      status: "success",
      message: "Account deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Update user status (admin only)
const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    const user = await userModel.updateUserStatus(userId, status);

    res.status(200).json({
      status: "success",
      message: "User status updated successfully",
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  getAllUsers,
  updateProfile,
  changePassword,
  deleteAccount,
  updateUserStatus,
};