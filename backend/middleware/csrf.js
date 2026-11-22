const crypto = require('crypto');
const { AppError } = require('../utils/errors');
const { REFRESH_TOKEN_TTL_DAYS } = require('../utils/cookies');

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const isProd = process.env.NODE_ENV === 'production';

/**
 * Double-submit CSRF protection. Auth is now in httpOnly cookies, which the
 * browser attaches to requests automatically (including cross-site ones,
 * since SameSite=None is required for a cross-domain deployment) — so a
 * malicious site could trigger authenticated requests on a victim's behalf.
 * Mitigation: issue a random token in a *readable* cookie; the frontend
 * echoes it back in a custom header on every state-changing request. A
 * cross-site attacker can trigger the request (cookie auto-attaches) but
 * can't read the cookie's value cross-origin, so it can't forge the header.
 */
const issueCsrfToken = (req, res, next) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      // As long as the refresh cookie: a session cookie ended with the browser while the login lived on,
      // so the first requests after a restart raced each other for a new token.
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
    // Make it visible to verifyCsrf if both run in the same request chain.
    req.cookies[CSRF_COOKIE] = token;
  }
  next();
};

// Server-to-server, carries no cookies, and is authenticated by its HMAC signature instead.
const CSRF_EXEMPT_PATH = '/api/payments/webhook';

const verifyCsrf = (req, res, next) => {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  if (req.method === 'POST' && req.path === CSRF_EXEMPT_PATH) return next();

  const cookieToken  = req.cookies?.[CSRF_COOKIE];
  const headerToken  = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    // Own code so the client can tell this apart and retry once (see frontend/src/services/api.ts).
    return next(new AppError('Invalid or missing CSRF token.', 403, 'CSRF_INVALID'));
  }
  next();
};

module.exports = { issueCsrfToken, verifyCsrf, CSRF_COOKIE, CSRF_HEADER };
