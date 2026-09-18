const crypto = require('crypto');
const { ForbiddenError } = require('../utils/errors');

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
    });
    // Make it visible to verifyCsrf if both run in the same request chain.
    req.cookies[CSRF_COOKIE] = token;
  }
  next();
};

const verifyCsrf = (req, res, next) => {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const cookieToken  = req.cookies?.[CSRF_COOKIE];
  const headerToken  = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new ForbiddenError('Invalid or missing CSRF token.'));
  }
  next();
};

module.exports = { issueCsrfToken, verifyCsrf, CSRF_COOKIE, CSRF_HEADER };
