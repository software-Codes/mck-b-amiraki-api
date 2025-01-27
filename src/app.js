const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { initializeDatabaseTables, sql } = require("./config/database");
const router = require('./routes/authRoutes');
const announcementRoutes = require('./routes/annoucements/annoucementsRoutes');

const createApp = () => {
  const app = express();
  const server = http.createServer(app);


  // // Initialize database tables
  initializeDatabaseTables();

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
  };

  // Route setup
  const setupRoutes = () => {
    // Auth routes
    app.use('/api/auth', router);
    // Add announcement routes
    app.use('/api/announcements', announcementRoutes);



    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        status: "error",
        message: "Route not found",
        availableRoutes: ["/api/auth/*",
          "/api/announcements/*"

        ],
      });
    });
  };

  // Global error handler
  const setupErrorHandler = () => {
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({
        status: "error",
        message: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
      });
    });
  };

  // Initialize app
  const initialize = async () => {
    await initializeDatabaseTables(); // Ensure database is ready
    setupMiddleware(); // Apply middleware
    setupRoutes(); // Register routes
    setupErrorHandler(); // Register error handler
    return app;
  };

  return {
    app,
    server,
    initialize,
  };
};

module.exports = createApp;
