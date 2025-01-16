// src/controllers/authController.js
const userModel = require('../models/userModel');
const { validationResult } = require('express-validator');
const upload = require('../middleware/authMiddleware');

// Register new user
const register = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: 'error',
                errors: errors.array()
            });
        }

        const { fullName, email, password, phoneNumber } = req.body;
        const profilePhoto = req.file;

        // Create user with optional profile photo
        const user = await userModel.createUser({
            fullName,
            email,
            password,
            phoneNumber,
            profilePhoto
        });

        res.status(201).json({
            status: 'success',
            message: 'User registered successfully',
            data: user
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
};

// Login user
const login = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: 'error',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;
        const { user, token } = await userModel.loginUser(email, password);

        res.status(200).json({
            status: 'success',
            message: 'Login successful',
            data: { user, token }
        });
    } catch (error) {
        res.status(401).json({
            status: 'error',
            message: error.message
        });
    }
};

// Get current user profile
const getProfile = async (req, res) => {
    try {
        const user = await userModel.findUserById(req.user.id);
        res.status(200).json({
            status: 'success',
            data: user
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
};

// Update user profile
const updateProfile = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: 'error',
                errors: errors.array()
            });
        }

        const updates = {
            fullName: req.body.fullName,
            phoneNumber: req.body.phoneNumber
        };

        const user = await userModel.updateUser(req.user.id, updates);
        
        res.status(200).json({
            status: 'success',
            message: 'Profile updated successfully',
            data: user
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
};

// Change password
const changePassword = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: 'error',
                errors: errors.array()
            });
        }

        const { currentPassword, newPassword } = req.body;
        
        // Verify current password
        const user = await userModel.findUserById(req.user.id);
        const isValidPassword = await userModel.verifyPassword(currentPassword, user.password);
        
        if (!isValidPassword) {
            return res.status(401).json({
                status: 'error',
                message: 'Current password is incorrect'
            });
        }

        await userModel.updatePassword(req.user.id, newPassword);
        
        res.status(200).json({
            status: 'success',
            message: 'Password updated successfully'
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
        });
    }
};

// Upload/update profile photo
const updateProfilePhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'Please upload a file'
            });
        }

        const user = await userModel.updateProfilePhoto(req.user.id, req.file);
        
        res.status(200).json({
            status: 'success',
            message: 'Profile photo updated successfully',
            data: user
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: error.message
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
                status: 'error',
                message: 'User not found'
            })
        }

        res.status(200).json({
            status: 'success',
            message: 'User deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

module.exports = {
    register,
    login,
    getProfile,
    updateProfile,
    changePassword,
    updateProfilePhoto,
    deleteAccount
};