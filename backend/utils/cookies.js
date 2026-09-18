const ACCESS_TOKEN_TTL_MIN   = parseInt(process.env.ACCESS_TOKEN_TTL_MIN, 10)   || 15;
const REFRESH_TOKEN_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS, 10) || 7;

const ACCESS_COOKIE  = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

const isProd = process.env.NODE_ENV === 'production';

// SameSite=None is required for a genuinely cross-site deployment (frontend
// and backend on different domains) and it in turn requires Secure=true.
// In dev, Lax + non-secure is used instead so cookies still work over plain
// http://localhost.
const baseOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
};

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions,
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_MIN * 60 * 1000,
  });
  // Scoped to /api/auth so it's only ever sent to the routes that need it
  // (refresh/logout), not on every single API request.
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions,
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions, path: '/api/auth' });
}

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_TOKEN_TTL_MIN,
  REFRESH_TOKEN_TTL_DAYS,
};
