const jwt = require('jsonwebtoken');
const { AuthError } = require('../utils/errors');
const { ACCESS_COOKIE } = require('../utils/cookies');

/**
 * Middleware: Verify the JWT access token from the httpOnly access_token
 * cookie. Attaches the decoded payload to req.user on success.
 */
const auth = (req, res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE];

  if (!token) {
    return next(new AuthError('No token provided. Access denied.'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'access') {
      return next(new AuthError('Invalid token type.'));
    }
    req.user = decoded; // { id, email, role, type }
    next();
  } catch {
    return next(new AuthError('Invalid or expired token.'));
  }
};

module.exports = auth;
