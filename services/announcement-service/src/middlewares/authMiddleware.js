const axios = require('axios');
const logger = require('../config/logger');

const verifyAuth = async (req, res, next) => {
    const logContext = 'AnnouncementAuthMiddleware';
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify token with auth service
        const response = await axios.post(
            `${process.env.AUTH_SERVICE_URL}/verify-token`,
            { token },
            {
                headers: {
                    'x-service-api-key': process.env.AUTH_SERVICE_API_KEY,
                    'x-service-name': 'announcement-service'
                }
            }
        );

        if (!response.data.isValid || !response.data.isAdmin) {
            logger.warn(`${logContext} - Invalid token or non-admin user`);
            return res.status(403).json({
                status: 'error',
                message: 'Admin access required'
            });
        }

        // Add user info to request
        req.user = {
            userId: response.data.userId,
            isAdmin: response.data.isAdmin,
            isSuperAdmin: response.data.isSuperAdmin
        };

        next();
    } catch (error) {
        logger.error(`${logContext} - Authentication error`, { error: error.message });
        return res.status(500).json({
            status: 'error',
            message: 'Authentication error occurred'
        });
    }
};

module.exports = { verifyAuth };