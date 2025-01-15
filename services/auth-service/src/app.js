// app/app.js
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { initializeDatabaseTables } from "./config/database";

export const createApp = () => {
  const app = express();
  const server = http.createServer(app);

  // Rate limiting configuration
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 400,
    message: "Too many requests, please try again later"
  });

  // Initialize database tables
  initializeDatabaseTables();


  // Middleware setup
  const setupMiddleware = () => {
    // CORS configuration
    app.use(cors({
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true
    }));
    
    app.use(helmet());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(limiter);
  };

  // Test routes setup
  const setupTestRoutes = () => {
    // Health check route
    app.get("/health", (req, res) => {
      res.status(200).json({
        status: "healthy",
        timestamp: new Date(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // Database test route
    app.get("/db-test", async (req, res) => {
      try {
        const result = await sql`SELECT version()`;
        res.status(200).json({
          status: "success",
          message: "Database connected",
          version: result[0].version
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Database connection failed",
          error: error.message
        });
      }
    });

    // Test user creation
    app.post("/test-user", async (req, res) => {
      try {
        const { full_name, email } = req.body;
        const user = await sql`
          INSERT INTO users (full_name, email)
          VALUES (${full_name}, ${email})
          RETURNING id, full_name, email
        `;
        
        res.status(201).json({
          status: "success",
          message: "Test user created",
          user: user[0]
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Failed to create test user",
          error: error.message
        });
      }
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        status: "error",
        message: "Route not found",
        availableRoutes: ["/health", "/db-test", "/test-user"]
      });
    });
  };

  // Global error handler
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
      status: "error",
      message: process.env.NODE_ENV === "development" ? err.message : "Internal server error"
    });
  });

  // Initialize everything
  const initialize = async () => {
    await initializeDatabaseTables();
    setupMiddleware();
    setupTestRoutes();
    return app;
  };

  return {
    app,
    server,
    initialize
  };
};