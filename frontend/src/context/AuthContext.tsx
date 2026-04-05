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
  logout:   () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Restore session from localStorage on page refresh
    const stored = localStorage.getItem('hms_user');
    if (stored) setUser(JSON.parse(stored));
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await authService.login({ email, password });
    if (!data.success) throw new Error(data.message);
    localStorage.setItem('hms_token', data.token);
    localStorage.setItem('hms_user',  JSON.stringify(data.user));
    setUser(data.user);
  };

  const register = async (formData: object) => {
    const { data } = await authService.register(formData as any);
    if (!data.success) throw new Error(data.message);
    localStorage.setItem('hms_token', data.token);
    localStorage.setItem('hms_user',  JSON.stringify(data.user));
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('hms_token');
    localStorage.removeItem('hms_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, role: user?.role ?? null, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
