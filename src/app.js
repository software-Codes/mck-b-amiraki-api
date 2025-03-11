const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { initializeDatabaseTables } = require("./config/database");
const authRoutes = require("./routes/authRoutes");
const announcementRoutes = require("./routes/annoucements/annoucementsRoutes");
const suggestionRoutes = require("./routes/suggestions/suggestionsRoutes");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const mediaContentRoutes  = require("./routes/churchgallery/mediaContent");
// const socketRoutes = require("./routes/sockets/chat-routes");
// const redis = require("redis");
// const redisAdapter = require("socket.io-redis");

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

  // Initialize the Socket.IO service
// const socketService = new socketService(server);

// Apply Redis adapter if needed for scaling
if (process.env.USE_REDIS === 'true') {
  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || '',
  };
  
  const pubClient = redis.createClient(redisConfig);
  const subClient = redis.createClient(redisConfig);
  
  socketService.io.adapter(redisAdapter({ pubClient, subClient }));
  
  console.log('Socket.IO Redis adapter initialized');
}

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
      { path: "/api/media", router: mediaContentRoutes },
      // { path: "/api/socket", router: socketRoutes },
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
          media: "  *",
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
          "/api/media/*",
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
      await 
      initializeDatabaseTables();
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
