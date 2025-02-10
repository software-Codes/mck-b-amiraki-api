const jwt = require('jsonwebtoken');
const { verifyTokenValidity } = require('../models/userModel');

const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if token was issued after the last logout
    const isTokenValid = await verifyTokenValidity(decoded.userId, decoded.iat);
    
    if (!isTokenValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Session expired. Please log in again.'
      });
    }

    // Attach user info to request
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired. Please log in again.'
      });
    }
    
    return res.status(401).json({
      status: 'error',
      message: 'Invalid authentication token'
    });
  }
};

module.exports = { authenticate };