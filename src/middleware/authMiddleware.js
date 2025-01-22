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
                SELECT id, email, role, status, full_name, last_login, is_super_admin
                FROM users
                WHERE id = ${decoded.userId};
            `;

            if (!user[0]) {
                logger.warn(`${logContext} - User not found`, { userId: decoded.userId });
                return res.status(401).json({
                    status: 'error',
                    message: 'Invalid authentication'
                });
            }

            // Check if user is active
            if (user[0].status !== 'active') {
                let message = 'Account is not active';
                if (user[0].status === 'pending' && user[0].role === UserRoles.ADMIN) {
                    message = 'Admin account pending verification. Please check your email.';
                }
                return res.status(401).json({
                    status: 'error',
                    message
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

// Super admin middleware
const requireSuperAdmin = (req, res, next) => {
    if (!req.user.is_super_admin) {
        return res.status(403).json({
            status: 'error',
            message: 'Super admin access required'
        });
    }
    next();
};

// Admin only middleware (includes super admin)
const requireAdmin = (req, res, next) => {
    if (req.user.role !== UserRoles.ADMIN) {
        return res.status(403).json({
            status: 'error',
            message: 'Admin access required'
        });
    }
    next();
};

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
const serviceAuthMiddleware = async (req, res, next) => {
    const logContext = 'ServiceAuthMiddleware';
    try {
        const serviceApiKey = req.headers['x-service-api-key'];
        const serviceName = req.headers['x-service-name'];

        console.log('Received Headers:', req.headers);

        if (!serviceApiKey || !serviceName) {
            logger.warn(`${logContext} - Missing service credentials`);
            return res.status(401).json({
                status: 'error',
                message: 'Service authentication required'
            });
        }

        const expectedApiKey = process.env[`${serviceName.toUpperCase()}_API_KEY`];
        console.log('Expected API Key:', expectedApiKey);

        if (serviceApiKey !== expectedApiKey) {
            logger.warn(`${logContext} - Invalid service API key`, { serviceName });
            return res.status(403).json({
                status: 'error',
                message: 'Invalid service authentication'
            });
        }
        next();
    } catch (error) {
        logger.error(`${logContext} - Service authentication error`, { error: error.message });
        return res.status(500).json({
            status: 'error',
            message: 'Service authentication error occurred'
        });
    }
};
module.exports = {
    authMiddleware,
    requireAdmin,
    requireSuperAdmin,
    requireActive,
    serviceAuthMiddleware
};