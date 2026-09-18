const multer = require('multer');
const { ZodError } = require('zod');
const { AppError } = require('../utils/errors');

// Known MySQL error codes we want to surface as clean 4xx responses instead
// of a raw 500 with driver internals.
const MYSQL_ERROR_MAP = {
  ER_DUP_ENTRY:            { statusCode: 409, code: 'CONFLICT',   message: 'This record already exists.' },
  ER_NO_REFERENCED_ROW_2:  { statusCode: 400, code: 'BAD_REQUEST', message: 'Referenced record does not exist.' },
  ER_ROW_IS_REFERENCED_2:  { statusCode: 409, code: 'CONFLICT',   message: 'This record is referenced elsewhere and cannot be modified.' },
};

function normalize(err) {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Invalid input.', details };
  }

  if (err instanceof multer.MulterError) {
    return { statusCode: 400, code: 'UPLOAD_ERROR', message: err.message };
  }

  if (err.code && MYSQL_ERROR_MAP[err.code]) {
    return MYSQL_ERROR_MAP[err.code];
  }

  return { statusCode: err.statusCode || 500, code: 'INTERNAL_ERROR', message: err.message || 'Internal Server Error' };
}

/**
 * Global error handling middleware.
 * Must be registered last in Express app (after all routes).
 */
const errorHandler = (err, req, res, next) => {
  const { statusCode, code, message, details } = normalize(err);

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${statusCode} ${code}:`, err.stack || err.message);

  // Don't leak internal error details to clients in production.
  const clientMessage = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'Something went wrong. Please try again later.'
    : message;

  res.status(statusCode).json({
    success: false,
    message: clientMessage,
    error: { code, message: clientMessage, ...(details && { details }) },
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
