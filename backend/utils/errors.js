/**
 * Operational error classes. Throwing (or calling next() with) one of these
 * from a route/controller lets errorHandler.js respond with the right status
 * code and a stable machine-readable `code` without every route hand-rolling
 * res.status(...).json(...).
 */
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Invalid input.', details) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class AuthError extends AppError {
  constructor(message = 'Unauthorized.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access denied.') {
    super(message, 403, 'FORBIDDEN');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict.') {
    super(message, 409, 'CONFLICT');
  }
}

module.exports = { AppError, ValidationError, AuthError, ForbiddenError, NotFoundError, ConflictError };
