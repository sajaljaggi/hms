import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

export type Role = 'patient' | 'doctor' | 'admin' | null;

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  specialization?: string;
}

interface AuthContextType {
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Optimistic initial render from the last-known user (display only, not a
  // security boundary — every real auth check happens server-side against
  // the httpOnly cookie) to avoid a flash of "logged out" while /me resolves.
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('hms_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authService.me()
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem('hms_user', JSON.stringify(data.user));
      })
      .catch(() => {
        setUser(null);
        localStorage.removeItem('hms_user');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await authService.login({ email, password });
    if (!data.success) throw new Error(data.message);
    localStorage.setItem('hms_user', JSON.stringify(data.user));
    setUser(data.user);
  };

  const register = async (formData: object) => {
    const { data } = await authService.register(formData as any);
    if (!data.success) throw new Error(data.message);
    localStorage.setItem('hms_user', JSON.stringify(data.user));
    setUser(data.user);
  };

  const logout = async () => {
    // Clear client state immediately; the server-side cookie clear happens
    // best-effort in the background so sign-out never feels laggy.
    setUser(null);
    localStorage.removeItem('hms_user');
    try {
      await authService.logout();
    } catch {
      /* already logged out client-side */
    }
  };

  return (
    <AuthContext.Provider value={{ user, role: user?.role ?? null, login, register, logout, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
