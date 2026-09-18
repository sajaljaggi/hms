import api from './api';

export interface LoginData { email: string; password: string; }
export interface RegisterData {
  name: string; email: string; password: string;
  phone?: string; gender?: string; age?: number;
  weight?: number; address?: string; city?: string;
  guardian_name?: string;
  // Accepted but ignored server-side — registration always creates a patient.
  role?: string;
}

export const authService = {
  login:    (data: LoginData)    => api.post('/auth/login', data),
  register: (data: RegisterData) => api.post('/auth/register', data),
  logout:   ()                   => api.post('/auth/logout'),
  me:       ()                   => api.get('/auth/me'),
};
