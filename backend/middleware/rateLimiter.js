const rateLimit = require('express-rate-limit');

// Shared handler so rate-limit rejections flow through the same
// { success, message, error } shape as every other error response.
const rateLimitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  });
};

// Login/register: brute-force protection. Keyed by IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Chatbot: public, unauthenticated, and calls a paid external API — needs
// its own (looser) limit to prevent cost abuse.
const chatbotLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

module.exports = { authLimiter, chatbotLimiter };
