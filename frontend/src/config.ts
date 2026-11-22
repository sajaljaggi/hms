// In local dev (Vite proxy) and the Docker/nginx setup, the frontend and
// backend share one origin, so relative paths ('/api') just
// work. When they're deployed to different domains (e.g. Vercel + Render),
// set VITE_BACKEND_URL to the backend's origin (no trailing slash) at build
// time and these become absolute URLs instead.
const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_URL || '';

export const API_BASE_URL = `${BACKEND_ORIGIN}/api`;

// Doctor photos are stored in the database; `version` (doctors.profile_image) changes on each upload.
export function doctorImageUrl(doctorId: number, version: string): string {
  return `${API_BASE_URL}/files/doctors/${doctorId}/image?v=${encodeURIComponent(version)}`;
}

// Prescription file_url is a relative API path (e.g. "/api/files/prescriptions/12"), served only to the
// patient and the doctor; this prefixes the backend origin for cross-origin deployments.
export function backendFileUrl(relativePath: string): string {
  return `${BACKEND_ORIGIN}${relativePath}`;
}
