const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const authRoutes = require("./routes/authRoutes");
const announcementRoutes = require("./routes/annoucements/annoucementsRoutes");
const { initializeDatabaseTables } = require("./config/database");
const suggestionRoutes = require("./routes/suggestions/suggestionsRoutes");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const mediaContentRoutes = require("./routes/churchgallery/mediaContent");
const { errorHandler } = require("./utils/global-errorHandler");

const createApp = () => {
  const app = express();
  const server = http.createServer(app);

  // Basic security and parsing middleware
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

  const setupMiddleware = () => {
    // Security middleware
    app.use(
      cors({
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
        maxAge: 86400,
      })
    );
    app.use(helmet());
    app.use(compression());
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Logging in development
    if (process.env.NODE_ENV === "development") {
      const morgan = require("morgan");
      app.use(morgan("dev"));
    }
  };

  const setupRoutes = () => {
    // API routes
    app.use("/api/auth", authRoutes);
    app.use("/api/announcements", announcementRoutes);
    app.use("/api/suggestions", suggestionRoutes);
    app.use("/api/media", mediaContentRoutes);

    // Health check
    app.get("/health", (req, res) => {
      res.json({ status: "healthy", timestamp: new Date().toISOString() });
    });

    // API documentation
    app.get("/api", (req, res) => {
      res.json({
        version: "1.0",
        availableRoutes: {
          auth: "/api/auth/*",
          announcements: "/api/announcements/*",
          suggestions: "/api/suggestions/*",
          media: "/api/media/*",
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
      });
    });
  };

  const initialize = async () => {
    try {
      // await initializeDatabaseTables();
      setupMiddleware();
      setupRoutes();

      // Add error handler AFTER other middleware and routes
      app.use(errorHandler);

      if (process.env.NODE_ENV === "development") {
        console.log("Application initialized successfully");
      }

      return app;
    } catch (error) {
      console.error("Failed to initialize application:", error);
      throw error;
    }
  };

  return { app, server, initialize };
};

module.exports = createApp;