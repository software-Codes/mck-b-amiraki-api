// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const { sql } = require('../config/database');

const authMiddleware = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                status: 'error',
                message: 'No token provided'
            });
        }

        // Extract token
        const token = authHeader.split(' ')[1];

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Check if user still exists
            const user = await sql`
                SELECT id, email, is_verified, full_name
                FROM users
                WHERE id = ${decoded.userId};
            `;

            if (!user[0]) {
                return res.status(401).json({
                    status: 'error',
                    message: 'User no longer exists'
                });
            }

            // Add user info to request
            req.user = user[0];
            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    status: 'error',
                    message: 'Token has expired'
                });
            }
            
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    status: 'error',
                    message: 'Invalid token'
                });
            }

            throw error;
        }
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: 'Authentication error'
        });
    }
};

// Optional middleware to check if user is verified
const requireVerified = (req, res, next) => {
    if (!req.user.is_verified) {
        return res.status(403).json({
            status: 'error',
            message: 'Email verification required'
        });
    }
    next();
};

// Optional middleware to handle admin-only routes
const requireAdmin = async (req, res, next) => {
    try {
        const admin = await sql`
            SELECT is_admin 
            FROM users 
            WHERE id = ${req.user.id} AND is_admin = true;
        `;

        if (!admin[0]) {
            return res.status(403).json({
                status: 'error',
                message: 'Admin access required'
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: 'Error checking admin status'
        });
    }
};

module.exports = {
    authMiddleware,
    requireVerified,
    requireAdmin
};