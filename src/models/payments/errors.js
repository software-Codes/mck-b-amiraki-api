//Base error class

class CustomError extends Error{
    constructor (message, statusCode, errorCode) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode || 500; // Internal server error
        this.errorCode = errorCode || "INTERNAL_ERROR" // Internal server error
        Error.captureStackTrace(this, this.constructor);
    }
}

// Validation Error (e.g., invalid input data) 
class ValidationError extends CustomError {
    constructor (message, errorCode) {
        super(message, 400, errorCode || "VALIDATION_ERROR"); // Bad request
    }
}

// Database Error (e.g., query failure)
class DatabaseError extends CustomError {
    constructor (message, errorCode) {
        super(message, 500, errorCode || "DATABASE_ERROR"); // Internal server error
    }
}

module.exports = {
    CustomError,
    ValidationError,
    DatabaseError
};