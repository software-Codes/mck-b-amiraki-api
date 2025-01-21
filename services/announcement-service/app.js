const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { initializeAnnouncementsTable, sql, createAnnouncementsTable } = require("./src/config/database");
const router = require('./src/routes/announcementsRoutes');
const verifyAuth = require('./src/middlewares/authMiddleware');

const createApp = () => {
  const app = express();
  const server = http.createServer(app);
  

  

  // Middleware setup
  const setupMiddleware = () => {
    // CORS configuration
    app.use(cors({
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }));

    // Security and parsing middleware
    app.use(helmet());
    app.use(express.json()); // Parses JSON request bodies
    app.use(express.urlencoded({ extended: true })); // Parses URL-encoded request bodies
    app.use(limiter); // Rate limiting
  };

  // Initialize app
  const initialize = async () => {
    await initializeAnnouncementsTable(); // Ensure database is ready
    setupMiddleware(); // Apply middleware
    setupRoutes(); // Register routes
    setupErrorHandler(); // Register error handler
    return app;
  };
  // Test endpoint in your announcement service
router.get('/test-auth', verifyAuth, (req, res) => {
    res.json({
        status: 'success',
        message: 'Authentication working',
        user: req.user
    });
});

  return {
    app,
    server,
    initialize,
  };
};


module.exports = createApp;
