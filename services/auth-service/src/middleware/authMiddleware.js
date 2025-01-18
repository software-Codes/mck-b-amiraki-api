// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const { sql } = require('../config/database');
const logger = require('../config/logger');
const { UserRoles } = require('../models/userModel');

// Main authentication middleware
const authMiddleware = async (req, res, next) => {
    const logContext = 'AuthMiddleware';
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required'
            });
        }

        // Extract token
        const token = authHeader.split(' ')[1];

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Check if user exists and is active
            const user = await sql`
                SELECT id, email, role, status, full_name, last_login
                FROM users
                WHERE id = ${decoded.userId} AND status = 'active';
            `;

            if (!user[0]) {
                logger.warn(`${logContext} - User not found or inactive`, { userId: decoded.userId });
                return res.status(401).json({
                    status: 'error',
                    message: 'User account is not active'
                });
            }

            // Check if token was issued before password change
            if (user[0].password_changed_at) {
                const passwordChangedTimestamp = new Date(user[0].password_changed_at).getTime() / 1000;
                if (decoded.iat < passwordChangedTimestamp) {
                    return res.status(401).json({
                        status: 'error',
                        message: 'Password has been changed. Please login again'
                    });
                }
            }

            // Add user info to request
            req.user = user[0];
            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    status: 'error',
                    message: 'Session expired. Please login again'
                });
            }
            
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    status: 'error',
                    message: 'Invalid authentication token'
                });
            }

            throw error;
        }
    } catch (error) {
        logger.error(`${logContext} - Authentication error`, { error: error.message });
        return res.status(500).json({
            status: 'error',
            message: 'Authentication error occurred'
        });
    }
};

// Middleware to check user role
const checkRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized access'
            });
        }
        next();
    };
};

// Admin only middleware
const requireAdmin = checkRole([UserRoles.ADMIN]);

// Optional: Active status middleware
const requireActive = (req, res, next) => {
    if (req.user.status !== 'active') {
        return res.status(403).json({
            status: 'error',
            message: 'Account is not active'
        });
    }
    next();
};

module.exports = {
    authMiddleware,
    requireAdmin,
    requireActive,
    checkRole
};