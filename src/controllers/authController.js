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
        success: false,  // Changed from status to success
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
        adminEmail: email,
      }
    );

    res.status(201).json({
      success: true,  // Changed from status to success
      message: "Admin registration initiated. Please check your email for verification code",
      data: {
        id: admin.id,
        email: email,
        status: "pending",
      },
    });
  } catch (error) {
    logger.error(`${logContext} - Admin registration failed`, {
      error: error.message,
    });
    res.status(400).json({
      success: false,  // Changed from status to success
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

    // Set token in HTTP-only cookie for additional security
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: user.role === UserRoles.ADMIN ? 12 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000 // 12h or 24h
    });

    logger.info(`${logContext} - Login successful`, {
      userId: user.id,
      role: user.role,
    });

    res.status(200).json({
      status: "success",
      message: "Login successful",
      data: { 
        user,
        sessionExpiry: new Date(Date.now() + (user.role === UserRoles.ADMIN ? 12 : 24) * 60 * 60 * 1000)
      },
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

// Delete user (admin or self)
const deleteUser = async (req, res) => {
  const userIdToDelete = req.user.id;
  const logContext = `UserController.deleteUser: ${userIdToDelete}`;

  try {
    // Log the deletion attempt
    logger.info(`${logContext} - User deletion attempt`, {
      requestingUserId: req.user.id,
      requestingUserRole: req.user.role
    });

    // Delete the logged-in user without checking additional permissions
    const deletionResult = await userModel.deleteUser(userIdToDelete);

    // Log successful deletion
    logger.info(`${logContext} - User deleted successfully`, {
      deletedUserId: deletionResult.deletedUserId
    });

    // Return success response
    res.status(200).json({
      status: "success",
      message: "User account deleted successfully",
    });
  } catch (error) {
    // Log deletion failure
    logger.error(`${logContext} - User deletion failed`, {
      error: error.message,
      requestingUserId: req.user.id,
      requestingUserRole: req.user.role
    });

    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};


//for service-service communication in microservices
const verifyToken = async (req, res) => {
  const logContext = "UserController.verifyToken";
  
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required"
      });
    }

    // Verify token and check validity
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const isTokenValid = await userModel.verifyTokenValidity(decoded.userId, decoded.iat);

    if (!isTokenValid) {
      return res.json({
        status: "error",
        isValid: false,
        message: "Token has been invalidated. Re-authentication required."
      });
    }

    // Check if user exists and has active status
    const user = await sql`
      SELECT id, email, role, status, is_super_admin
      FROM users
      WHERE id = ${decoded.userId} AND status = 'active'
    `;

    if (!user[0]) {
      return res.json({
        status: "error",
        isValid: false,
        message: "User not found or inactive"
      });
    }

    return res.json({
      status: "success",
      isValid: true,
      isAdmin: user[0].role === UserRoles.ADMIN,
      is_super_admin: user[0].is_super_admin,
      userId: user[0].id
    });

  } catch (error) {
    logger.error(`${logContext} - Token verification failed`, {
      error: error.message,
    });
    
    return res.status(400).json({
      status: "error",
      isValid: false,
      message: error.name === 'TokenExpiredError' ? 
        "Token has expired. Please log in again." : 
        "Invalid token. Please log in again."
    });
  }
};
// Logout user
const logout = async (req, res) => {
  const logContext = `UserController.logout: ${req.user?.id}`;

  try {
    // Ensure user is authenticated
    if (!req.user?.id) {
      logger.warn(`${logContext} - Logout attempted without authentication`);
      return res.status(401).json({
        status: "error",
        message: "Authentication required"
      });
    }

    // Perform logout operation
    const logoutResult = await userModel.logoutUser(req.user.id);

    // Clear authentication cookie
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    // Invalidate any active sessions in your session store if you're using one
    if (req.session) {
      await new Promise((resolve) => {
        req.session.destroy((err) => {
          if (err) {
            logger.error(`${logContext} - Session destruction failed`, { error: err.message });
          }
          resolve();
        });
      });
    }

    logger.info(`${logContext} - User logged out successfully`, {
      userId: req.user.id,
      timestamp: logoutResult.logoutTimestamp
    });

    res.status(200).json({
      status: "success",
      message: "Logout successful. Please log in again to continue.",
      timestamp: logoutResult.logoutTimestamp
    });

  } catch (error) {
    logger.error(`${logContext} - Logout failed`, {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      status: "error",
      message: "An error occurred during logout. Please try again."
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
  verifyToken,
  logout
};
