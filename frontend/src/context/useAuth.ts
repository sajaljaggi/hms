import { createContext, useContext } from 'react';

export type Role = 'patient' | 'doctor' | 'admin' | null;

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  specialization?: string;
}

export interface AuthContextType {
  user: User | null;
  role: Role;
  login:    (email: string, password: string) => Promise<void>;
  register: (data: object) => Promise<void>;
  logout:   () => Promise<void>;
  isAuthenticated: boolean;
  // True until the initial /auth/me session check resolves. The auth token
  // lives in an httpOnly cookie now, so the frontend can't just read it —
  // it has to ask the server whether the session is still valid.
  isLoading: boolean;
}

// Split into its own module (rather than living in AuthContext.tsx) so that
// file only exports the AuthProvider component — Vite Fast Refresh requires
// a component file to export nothing but components.
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
