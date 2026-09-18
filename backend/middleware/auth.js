const jwt = require('jsonwebtoken');
const { AuthError } = require('../utils/errors');

/**
 * Middleware: Verify JWT token from Authorization header.
 * Attaches decoded payload to req.user on success.
 */
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthError('No token provided. Access denied.'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    return next(new AuthError('Invalid or expired token.'));
  }
};

module.exports = auth;
