// In local dev (Vite proxy) and the Docker/nginx setup, the frontend and
// backend share one origin, so relative paths ('/api', '/uploads') just
// work. When they're deployed to different domains (e.g. Vercel + Render),
// set VITE_BACKEND_URL to the backend's origin (no trailing slash) at build
// time and these become absolute URLs instead.
const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_URL || '';

export const API_BASE_URL = `${BACKEND_ORIGIN}/api`;

export function uploadUrl(path: string): string {
  return `${BACKEND_ORIGIN}/uploads/${path}`;
}

// The backend stores prescription file_url as an already-relative path
// (e.g. "/uploads/169...-report.pdf") — this just prefixes the backend
// origin onto it for cross-origin deployments.
export function backendFileUrl(relativePath: string): string {
  return `${BACKEND_ORIGIN}${relativePath}`;
}
