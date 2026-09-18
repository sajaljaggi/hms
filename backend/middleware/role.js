const { AuthError, ForbiddenError } = require('../utils/errors');

/**
 * Middleware factory: restrict access to specific roles.
 * Usage: requireRole('admin') or requireRole('doctor', 'admin')
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthError('Unauthorized: No user session.'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Access denied. Requires role: ${roles.join(' or ')}.`));
    }
    next();
  };
};

module.exports = requireRole;
