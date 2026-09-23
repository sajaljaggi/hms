import axios from 'axios';
import { API_BASE_URL } from '../config';

// Reads a cookie value directly — used for the CSRF double-submit pattern.
// (The auth cookies themselves are httpOnly and never touched by JS.)
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// Base Axios instance — all requests go through this
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send/receive the httpOnly auth cookies
});

// ── Request interceptor: attach CSRF token on state-changing requests ──────
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
api.interceptors.request.use(
  (config) => {
    if (config.method && UNSAFE_METHODS.has(config.method)) {
      const csrfToken = getCookie('csrf_token');
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Routes that should never trigger a silent-refresh retry loop.
const AUTH_ROUTES_NO_RETRY = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

let refreshPromise: Promise<unknown> | null = null;

// ── Response interceptor: on 401, try one silent refresh, then retry ───────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url ?? '';

    const shouldAttemptRefresh =
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      !AUTH_ROUTES_NO_RETRY.some((route) => url.includes(route));

    if (shouldAttemptRefresh) {
      originalRequest._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = api.post('/auth/refresh').finally(() => {
            refreshPromise = null;
          });
        }
        await refreshPromise;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('hms_user');
        // Only force-navigate away from protected routes. This 401 can also
        // come from the background /auth/me check that fires on every page
        // load (including the public Home page) — redirecting unconditionally
        // sent logged-out visitors straight to /login on every refresh, even
        // on pages that never needed auth in the first place. Protected
        // routes already redirect themselves via Layout's isAuthenticated
        // check, so this only needs to catch a session dying mid-use on one
        // of them.
        const isProtectedRoute = ['/patient', '/doctor', '/admin'].some((prefix) =>
          window.location.pathname.startsWith(prefix)
        );
        if (isProtectedRoute && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
