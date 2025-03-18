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
                SELECT 
                    id, 
                    email, 
                    role, 
                    status, 
                    full_name, 
                    last_login, 
                    is_super_admin,
                    password_changed_at,
                    token_invalidated_at
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
                const passwordChangedTimestamp = Math.floor(
                    new Date(user[0].password_changed_at).getTime() / 1000
                );
                if (decoded.iat < passwordChangedTimestamp) {
                    return res.status(401).json({
                        status: 'error',
                        message: 'Security session expired. Please login again to continue with enjoying our services'
                    });
                }
            }

            // Check if token was invalidated by logout
            if (user[0].token_invalidated_at) {
                const invalidationTimestamp = Math.floor(
                    new Date(user[0].token_invalidated_at).getTime() / 1000
                );
                if (decoded.iat < invalidationTimestamp) {
                    return res.status(401).json({
                        status: 'error',
                        message: 'Session expired. Please login again'
                    });
                }
            }

            // Add user info to request
            req.user = {
                ...user[0],
                userId: user[0].id // Add consistent userId property
            };
            
            // Prohibit API access for admins in specific cases
            if (user[0].role === UserRoles.ADMIN && user[0].requires_reauth) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Re-authentication required for this operation'
                });
            }

            next();
        } catch (error) {
            // Handle token expiration first
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    status: 'error',
                    code: 'TOKEN_EXPIRED',
                    message: 'Session expired. Please login again to continue with enjoying our services'
                });
            }

            // Handle invalid token format
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    status: 'error',
                    code: 'INVALID_TOKEN',
                    message: 'Invalid authentication token'
                });
            }

            // Log unexpected errors
            logger.error(`${logContext} - Token verification error`, {
                error: error.message,
                stack: error.stack
            });
            
            return res.status(500).json({
                status: 'error',
                message: 'Authentication system error'
            });
        }
    } catch (error) {
        logger.error(`${logContext} - Authentication error`, { 
            error: error.message,
            stack: error.stack,
            endpoint: req.originalUrl
        });
        
        return res.status(500).json({
            status: 'error',
            code: 'AUTH_SYSTEM_ERROR',
            message: 'Authentication system malfunction'
        });
    }
};

// Role-based authorization middleware
const roleMiddleware = (allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                status: 'error',
                message: 'Insufficient permissions for this operation'
            });
        }
        next();
    };
};

// Sensitive operations middleware
const sensitiveOperationsMiddleware = async (req, res, next) => {
    try {
        // Check if re-authentication is required
        const user = await sql`
            SELECT requires_reauth FROM users WHERE id = ${req.user.userId}
        `;

        if (user[0].requires_reauth) {
            return res.status(401).json({
                status: 'error',
                message: 'Re-authentication required for this operation'
            });
        }
        
        next();
    } catch (error) {
        logger.error('SensitiveOperationsMiddleware error', error);
        res.status(500).json({
            status: 'error',
            message: 'Authorization system error'
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

module.exports = {
    authMiddleware,
    requireAdmin,
    requireSuperAdmin,
    requireActive,
    roleMiddleware,
    sensitiveOperationsMiddleware
};