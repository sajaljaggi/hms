/**
 * Global error handling middleware.
 * Must be registered last in Express app (after all routes).
 */
const errorHandler = (err, req, res, next) => {
  console.error('❌ Unhandled Error:', err.stack || err.message);

  const statusCode = err.statusCode || 500;
  const message    = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
