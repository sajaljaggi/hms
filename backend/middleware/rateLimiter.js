const rateLimit = require('express-rate-limit');

// Shared handler so rate-limit rejections flow through the same
// { success, message, error } shape as every other error response.
const rateLimitHandler = (req, res) => {
  // The IP seen and the proxy chain, so the TRUST_PROXY_HOPS setting can be checked from the logs.
  console.warn(`[rate-limit] ${req.method} ${req.originalUrl} limited; ip=${req.ip} x-forwarded-for="${req.headers['x-forwarded-for'] || ''}"`);
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  });
};

// Login/register: brute-force protection. Keyed by IP. Only failed attempts count, so a room full of
// people signing in behind one shared address (school wifi, a proxy) is never locked out by successes.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

// Login: also keyed by the email being tried, so guessing one account's password stays limited even when
// many visitors share an IP or an attacker rotates IPs. Only failures count.
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${String(req.body?.email ?? '').trim().toLowerCase()}`,
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

module.exports = { authLimiter, loginAccountLimiter, chatbotLimiter };
