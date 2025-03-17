/**
 * AppLogger.js
 * Comprehensive logging and user alerting system for mobile application
 */
const winston = require("winston");
const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, json } = format;
const fs = require("fs");
const path = require("path");

// Ensure log directory exists
const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Define log levels with corresponding alert types
const logLevels = {
  levels: {
    fatal: 0, // System is unusable
    error: 1, // Error that prevents feature from working
    warn: 2, // Warning that might affect user experience
    info: 3, // Normal but significant events
    http: 4, // HTTP request logging
    debug: 5, // Detailed debug information
    silly: 6, // Very detailed debugging
  },
  colors: {
    fatal: "red",
    error: "red",
    warn: "yellow",
    info: "green",
    http: "blue",
    debug: "magenta",
    silly: "grey",
  },
};

// Custom format for console output
const consoleFormat = printf(
  ({ level, message, timestamp, context, ...metadata }) => {
    const metaStr = Object.keys(metadata).length
      ? JSON.stringify(metadata, null, 2)
      : "";
    return `${timestamp} [${level.toUpperCase()}] ${
      context ? `[${context}]` : ""
    }: ${message} ${metaStr}`;
  }
);

// Create the logger instance
const logger = createLogger({
  levels: logLevels.levels,
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), json()),
  defaultMeta: { service: "suggestion-service" },
  transports: [
    // Console transport for development
    new transports.Console({
      format: combine(
        colorize({ colors: logLevels.colors }),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        consoleFormat
      ),
    }),
    // File transport for errors and above
    new transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
    // File transport for all logs
    new transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
  exceptionHandlers: [
    new transports.File({ filename: path.join(logDir, "exceptions.log") }),
  ],
  rejectionHandlers: [
    new transports.File({ filename: path.join(logDir, "rejections.log") }),
  ],
});

// Add Winston colors
winston.addColors(logLevels.colors);

// Define user alert levels and their corresponding messages
const alertTypes = {
  CRITICAL: {
    type: "CRITICAL",
    persistent: true,
    autoExpire: false,
  },
  ERROR: {
    type: "ERROR",
    persistent: true,
    autoExpire: false,
  },
  WARNING: {
    type: "WARNING",
    persistent: false,
    autoExpire: true,
    expireTime: 10000, // 10 seconds
  },
  INFO: {
    type: "INFO",
    persistent: false,
    autoExpire: true,
    expireTime: 5000, // 5 seconds
  },
  SUCCESS: {
    type: "SUCCESS",
    persistent: false,
    autoExpire: true,
    expireTime: 5000, // 5 seconds
  },
  NETWORK: {
    type: "NETWORK",
    persistent: true,
    autoExpire: false,
  },
};

/**
 * User Alert class for handling alerts to be sent to the mobile app
 */
class UserAlert {
  constructor() {
    this.pendingAlerts = [];
    this.networkStatus = {
      online: true,
      lastChecked: Date.now(),
    };
  }

  /**
   * Create a new alert to be sent to user
   * @param {Object} options Alert options
   * @param {string} options.message Alert message
   * @param {string} options.type Alert type (from alertTypes)
   * @param {string} [options.actionText] Text for action button
   * @param {string} [options.actionRoute] Route to navigate to on action
   * @param {string} [options.context] Context information
   * @param {Object} [options.metadata] Additional metadata
   * @param {boolean} [options.error] Is this an error alert
   * @returns {Object} The created alert
   */
  createAlert({
    message,
    type = "INFO",
    actionText,
    actionRoute,
    context,
    metadata = {},
    error = false,
  }) {
    if (!Object.keys(alertTypes).includes(type)) {
      logger.warn(`Invalid alert type: ${type}, defaulting to INFO`, {
        context: "AlertSystem",
      });
      type = "INFO";
    }

    const alertConfig = alertTypes[type];
    const alert = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      message,
      ...alertConfig,
      timestamp: new Date().toISOString(),
      context,
      actionText,
      actionRoute,
      metadata,
      error,
    };

    // Add to pending alerts
    this.pendingAlerts.push(alert);

    // Log the alert
    const logLevel = error ? "error" : type === "WARNING" ? "warn" : "info";
    logger[logLevel](message, {
      context: context || "UserAlert",
      alertType: type,
      ...metadata,
    });

    return alert;
  }

  /**
   * Get all pending alerts and clear the queue
   * @returns {Array} List of pending alerts
   */
  getPendingAlerts() {
    const alerts = [...this.pendingAlerts];
    this.pendingAlerts = [];
    return alerts;
  }

  /**
   * Create network status alert
   * @param {boolean} online Whether the network is online
   * @returns {Object|null} Alert object or null if status unchanged
   */
  updateNetworkStatus(online) {
    // Only create alert if status has changed
    if (this.networkStatus.online === online) {
      return null;
    }

    this.networkStatus = {
      online,
      lastChecked: Date.now(),
    };

    if (online) {
      return this.createAlert({
        message: "You are back online. Syncing data...",
        type: "SUCCESS",
        context: "NetworkStatus",
      });
    } else {
      return this.createAlert({
        message: "No internet connection. Some features may be unavailable.",
        type: "NETWORK",
        context: "NetworkStatus",
        error: true,
        metadata: { networkStatus: "offline" },
      });
    }
  }

  /**
   * Create system error alert
   * @param {Error} error Error object
   * @param {string} context Context information
   * @returns {Object} Created alert
   */
  systemError(error, context = "System") {
    // Log the full error
    logger.error(`System error: ${error.message}`, {
      context,
      stack: error.stack,
      code: error.code,
    });

    // Create user-friendly alert
    return this.createAlert({
      message: "Something went wrong. Please try again later.",
      type: "ERROR",
      context,
      error: true,
      metadata: {
        errorType: error.name,
        errorCode: error.code || "UNKNOWN",
      },
    });
  }

  /**
   * Handle API response error and create appropriate user alert
   * @param {Object} error API error response
   * @param {string} context Context information
   * @returns {Object} Created alert
   */
  apiError(error, context = "API") {
    // Default values
    let message = "Something went wrong. Please try again later.";
    let type = "ERROR";

    // Log the full error
    logger.error(`API error: ${error.message || "Unknown error"}`, {
      context,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack,
    });

    // Create user-friendly message based on status code
    if (error.response) {
      const status = error.response.status;

      if (status === 400) {
        message =
          error.response.data?.message ||
          "Invalid request. Please check your inputs.";
        type = "WARNING";
      } else if (status === 401) {
        message = "Your session has expired. Please log in again.";
        type = "ERROR";
      } else if (status === 403) {
        message = "You don't have permission to perform this action.";
        type = "ERROR";
      } else if (status === 404) {
        message = "The requested resource was not found.";
        type = "WARNING";
      } else if (status >= 500) {
        message = "Server error. Our team has been notified.";
        type = "ERROR";
      }
    } else if (error.request) {
      // Request made but no response received
      message = "No response from server. Please check your connection.";
      type = "NETWORK";
      // Update network status
      this.updateNetworkStatus(false);
    }

    // Create user alert
    return this.createAlert({
      message,
      type,
      context,
      error: true,
      metadata: {
        status: error.response?.status,
        errorCode: error.code || "UNKNOWN",
      },
    });
  }

  /**
   * Create validation error alert
   * @param {Object} errors Validation errors
   * @param {string} context Context information
   * @returns {Object} Created alert
   */
  validationError(errors, context = "Validation") {
    // Create a readable message from validation errors
    let errorMessages = "";

    if (Array.isArray(errors)) {
      errorMessages = errors.map((e) => e.message || e).join(". ");
    } else if (typeof errors === "object") {
      errorMessages = Object.values(errors)
        .map((e) => e.message || e)
        .join(". ");
    } else {
      errorMessages = String(errors);
    }

    const message = `Validation failed: ${errorMessages}`;

    // Log the validation error
    logger.warn(message, { context, validationErrors: errors });

    // Create user alert
    return this.createAlert({
      message:
        message.length > 100 ? `${message.substring(0, 100)}...` : message,
      type: "WARNING",
      context,
      error: true,
      metadata: { validationErrors: errors },
    });
  }

  /**
   * Create success alert
   * @param {string} message Success message
   * @param {string} context Context information
   * @returns {Object} Created alert
   */
  success(message, context = "Operation") {
    return this.createAlert({
      message,
      type: "SUCCESS",
      context,
    });
  }
}

// Create a singleton instance of UserAlert
const userAlertSystem = new UserAlert();

// Combined logging and alerting system
const AppLogger = {
  // Core logging functions
  fatal: (message, metadata = {}) => {
    logger.log("fatal", message, metadata);
    return userAlertSystem.createAlert({
      message:
        metadata.userMessage ||
        "A critical error has occurred. Please contact support.",
      type: "CRITICAL",
      context: metadata.context,
      error: true,
      metadata,
    });
  },

  error: (message, metadata = {}) => {
    logger.error(message, metadata);
    if (metadata.alertUser !== false) {
      return userAlertSystem.createAlert({
        message:
          metadata.userMessage || "An error occurred. Please try again later.",
        type: "ERROR",
        context: metadata.context,
        error: true,
        metadata,
      });
    }
    return null;
  },

  warn: (message, metadata = {}) => {
    logger.warn(message, metadata);
    if (metadata.alertUser) {
      return userAlertSystem.createAlert({
        message: metadata.userMessage || message,
        type: "WARNING",
        context: metadata.context,
        metadata,
      });
    }
    return null;
  },

  info: (message, metadata = {}) => {
    logger.info(message, metadata);
    if (metadata.alertUser) {
      return userAlertSystem.createAlert({
        message: metadata.userMessage || message,
        type: "INFO",
        context: metadata.context,
        metadata,
      });
    }
    return null;
  },

  debug: (message, metadata = {}) => logger.debug(message, metadata),

  http: (message, metadata = {}) => logger.http(message, metadata),

  // User alert functions
  alert: userAlertSystem.createAlert.bind(userAlertSystem),

  getPendingAlerts: userAlertSystem.getPendingAlerts.bind(userAlertSystem),

  updateNetworkStatus:
    userAlertSystem.updateNetworkStatus.bind(userAlertSystem),

  systemError: userAlertSystem.systemError.bind(userAlertSystem),

  apiError: userAlertSystem.apiError.bind(userAlertSystem),

  validationError: userAlertSystem.validationError.bind(userAlertSystem),

  success: userAlertSystem.success.bind(userAlertSystem),

  // Middleware for Express to log HTTP requests
  requestLogger: (req, res, next) => {
    const start = Date.now();

    // Log when request completes
    res.on("finish", () => {
      const duration = Date.now() - start;
      const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

      // Define log level based on status code
      let level = "http";
      if (res.statusCode >= 500) level = "error";
      else if (res.statusCode >= 400) level = "warn";

      logger.log(level, message, {
        context: "HTTP",
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        userId: req.user?.id,
      });
    });

    next();
  },
};

module.exports = AppLogger;
