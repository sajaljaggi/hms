import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import type { RegisterData } from '../services/authService';
import { AuthContext, type User } from './useAuth';

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
    const { data } = await authService.register(formData as RegisterData);
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
