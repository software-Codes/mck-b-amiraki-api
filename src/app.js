const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
// const { initializeDatabaseTables } = require("./config/database");
const authRoutes = require("./routes/authRoutes");
const announcementRoutes = require("./routes/annoucements/annoucementsRoutes");
const suggestionRoutes = require("./routes/suggestions/suggestionsRoutes");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const createApp = () => {
  const app = express();
  const server = http.createServer(app);

  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.JWT_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "strict",
      },
    })
  );

  // Middleware setup
  const setupMiddleware = () => {
    // CORS configuration
    app.use(
      cors({
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
        maxAge: 86400, // CORS preflight cache - 24 hours
      })
    );

    // Security and parsing middleware
    app.use(
      helmet({
        contentSecurityPolicy: process.env.NODE_ENV === "production",
        crossOriginEmbedderPolicy: process.env.NODE_ENV === "production",
      })
    );
    app.use(compression()); // Compress responses
    app.use(express.json({ limit: "10mb" })); // Limit JSON payload size
    app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request logging in development
    if (process.env.NODE_ENV === "development") {
      const morgan = require("morgan");
      app.use(morgan("dev"));
    }
  };

  // Route setup
  const setupRoutes = () => {
    // API routes
    const apiRoutes = [
      { path: "/api/auth", router: authRoutes },
      { path: "/api/announcements", router: announcementRoutes },
      { path: "/api/suggestions", router: suggestionRoutes },
    ];

    // Register all API routes
    apiRoutes.forEach(({ path, router }) => {
      app.use(path, router);
    });

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.json({ status: "healthy", timestamp: new Date().toISOString() });
    });

    // API documentation endpoint
    app.get("/api", (req, res) => {
      res.json({
        version: "1.0",
        availableRoutes: {
          auth: "/api/auth/*",
          announcements: "/api/announcements/*",
          suggestions: "/api/suggestions/*",
        },
        documentation: process.env.API_DOCS_URL || "Documentation URL not set",
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        status: "error",
        message: "Route not found",
        availableRoutes: [
          "/api/auth/*",
          "/api/announcements/*",
          "/api/suggestions/*",
        ],
        suggestion: "Check the API documentation at /api for more information",
      });
    });
  };

  // Global error handler
  const setupErrorHandler = () => {
    app.use((err, req, res, next) => {
      // Log error details
      console.error("Unhandled Error:", {
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });

      // Send appropriate response
      const statusCode = err.status || 500;
      res.status(statusCode).json({
        status: "error",
        message:
          process.env.NODE_ENV === "development"
            ? err.message
            : "Internal server error",
        ...(process.env.NODE_ENV === "development" && {
          stack: err.stack,
          path: req.path,
          method: req.method,
        }),
      });
    });
  };

  // Initialize app
  const initialize = async () => {
    try {
      await // initializeDatabaseTables();
      setupMiddleware();
      setupRoutes();
      setupErrorHandler();

      // Log successful initialization in development
      if (process.env.NODE_ENV === "development") {
        console.log("Application initialized successfully");
      }

      return app;
    } catch (error) {
      console.error("Failed to initialize application:", error);
      throw error;
    }
  };

  return {
    app,
    server,
    initialize,
  };
};

module.exports = createApp;
