const userModel = require("../models/userModel");
const { validationResult } = require("express-validator");
const logger = require("../config/logger");
const { verify } = require("jsonwebtoken");
const { sql } = require("../config/database");
const { UserRoles } = userModel;
// Register new user
const register = async (req, res) => {
  const logContext = `UserController.register: ${req.body.email}`;

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

    const { fullName, email, password, phoneNumber } = req.body;
    const profilePhoto = req.file;

    const user = await userModel.createUser({
      fullName,
      email,
      password,
      phoneNumber,
      profilePhoto,
    });

    logger.info(`${logContext} - User registered successfully`, {
      userId: user.id,
    });

    res.status(201).json({
      status: "success",
      message: "Registration successful",
      data: user,
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

// Register admin with email verification
const registerAdmin = async (req, res) => {
  const logContext = `UserController.registerAdmin: ${req.body.email}`;

  try {
    logger.info(`${logContext} - Starting admin registration`);

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

    const { fullName, email, password, phoneNumber, is_super_admin } = req.body;

    // Create admin account
    const admin = await userModel.createAdmin({
      fullName,
      email,
      password,
      phoneNumber,
      is_super_admin,
    });

    // Log success after admin creation
    logger.info(
      `${logContext} - Admin registered and verification email sent`,
      {
        adminId: admin.id,
        adminEmail: email, // Use email from request body
      }
    );

    res.status(201).json({
      status: "success",
      message:
        "Admin registration initiated. Please check your email for verification code",
      data: {
        id: admin.id,
        email: email, // Use email from request body
        status: "pending",
      },
    });
  } catch (error) {
    logger.error(`${logContext} - Admin registration failed`, {
      error: error.message,
    });
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
// Verify admin account
const verifyAdmin = async (req, res) => {
  const logContext = `UserController.verifyAdmin: ${req.body.email}`;

  try {
    logger.info(`${logContext} - Attempting admin verification`);

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

    const { email, verificationCode } = req.body;
    const verifiedAdmin = await userModel.verifyAdminAccount(
      email,
      verificationCode
    );

    logger.info(`${logContext} - Admin verified successfully`, {
      userId: verifiedAdmin.id,
    });

    res.status(200).json({
      status: "success",
      message: "Admin account verified successfully",
      data: verifiedAdmin,
    });
  } catch (error) {
    logger.error(`${logContext} - Admin verification failed`, {
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
  const logContext = `UserController.login: ${req.body.email}`;

  try {
    logger.info(`${logContext} - Attempting login`);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: "error",
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;
    const { user, token } = await userModel.loginUser(email, password);

    logger.info(`${logContext} - Login successful`, {
      userId: user.id,
      role: user.role,
    });

    res.status(200).json({
      status: "success",
      message: "Login successful",
      data: { user, token },
    });
  } catch (error) {
    logger.error(`${logContext} - Login failed`, {
      error: error.message,
    });
    res.status(401).json({
      status: "error",
      message: error.message,
    });
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await userModel.getUserById(req.user.id, req.user.role);
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
    if (req.user.role !== UserRoles.ADMIN) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized: Admin access required",
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filters = {
      role: req.query.role,
      status: req.query.status,
      search: req.query.search,
    };

    const userData = await userModel.getAllUsers(filters, page, limit);

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

// Get specific user (admin only)
const getUser = async (req, res) => {
  try {
    if (req.user.role !== UserRoles.ADMIN) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized: Admin access required",
      });
    }

    const user = await userModel.getUserById(req.params.userId, req.user.role);
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

// Update the updateProfile function
const updateProfile = async (req, res) => {
  const logContext = `UserController.updateProfile: ${req.user.id}`;

  try {
    logger.info(`${logContext} - Attempting profile update`);

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

    const updates = {
      fullName: req.body.fullName,
      phoneNumber: req.body.phoneNumber,
    };

    // Handle profile photo if uploaded
    if (req.file) {
      updates.profilePhoto = req.file;
    }

    const user = await userModel.updateUser(
      req.user.id,
      updates,
      req.user.role
    );

    logger.info(`${logContext} - Profile updated successfully`);

    res.status(200).json({
      status: "success",
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    logger.error(`${logContext} - Profile update failed`, {
      error: error.message,
    });
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

// Admin update user
const updateUser = async (req, res) => {
  try {
    if (req.user.role !== UserRoles.ADMIN) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized: Admin access required",
      });
    }

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
      role: req.body.role,
      status: req.body.status,
    };

    const user = await userModel.updateUser(
      req.params.userId,
      updates,
      req.user.role
    );

    res.status(200).json({
      status: "success",
      message: "User updated successfully",
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
  const logContext = `UserController.changePassword: ${req.user.id}`;

  try {
    logger.info(`${logContext} - Attempting password change`);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: "error",
        errors: errors.array(),
      });
    }

    const { currentPassword, newPassword } = req.body;
    await userModel.updatePassword(req.user.id, currentPassword, newPassword);

    logger.info(`${logContext} - Password changed successfully`);

    res.status(200).json({
      status: "success",
      message: "Password updated successfully",
    });
  } catch (error) {
    logger.error(`${logContext} - Password change failed`, {
      error: error.message,
    });
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

// Delete account (for users)
const deleteAccount = async (req, res) => {
  const logContext = `UserController.deleteAccount: ${req.user.id}`;

  try {
    logger.info(`${logContext} - Attempting account deletion`);

    await userModel.deleteUser(req.user.id, req.user.role);

    logger.info(`${logContext} - Account deleted successfully`);

    res.status(200).json({
      status: "success",
      message: "Account deleted successfully",
    });
  } catch (error) {
    logger.error(`${logContext} - Account deletion failed`, {
      error: error.message,
    });
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

// Delete user (admin only)
const deleteUser = async (req, res) => {
  const logContext = `UserController.deleteUser: ${req.params.userId}`;

  try {
    if (req.user.role !== UserRoles.ADMIN) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized: Admin access required",
      });
    }

    logger.info(`${logContext} - Admin attempting to delete user`);

    await userModel.deleteUser(req.params.userId, req.user.role);

    logger.info(`${logContext} - User deleted successfully`);

    res.status(200).json({
      status: "success",
      message: "User deleted successfully",
    });
  } catch (error) {
    logger.error(`${logContext} - User deletion failed`, {
      error: error.message,
    });
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

//for service-service communication in microservices
const verifyToken = async (req, res) => {
  const logContext = "verifyToken";
  try {
    const { token } = req.body;

    //verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    //check if user exists and has admin prvileges

    const user = await sql`
    SELECT id, email, role, status, is_super_admin
    FROM users
    WHERE id = ${decoded.userId}
    `;
    if(!user[0] || user[0].status !== "active"){
      return res.json({
        status: "error",
        isValid: false,
      });
    }
    return res.json({
      status: "success",
      isValid: true,
      isAdmin: user[0].role === UserRoles.ADMIN,
      is_super_admin: user[0].is_super_admin,
      userId: user[0].id,
    })
  } catch (error) {
    logger.error(`${logContext} - Token verification failed`, {
      error: error.message,
    });
    res.status(400).json({
      status: "error",
      message: error.message,
    });

  }
};

module.exports = {
  register,
  registerAdmin,
  verifyAdmin,
  login,
  getProfile,
  getUser,
  getAllUsers,
  updateProfile,
  updateUser,
  changePassword,
  deleteAccount,
  deleteUser,
  verifyToken
};
