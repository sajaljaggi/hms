import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import { AuthContext, type AuthContextType } from '../context/useAuth';

vi.mock('./Chatbot', () => ({ default: () => null }));
vi.mock('./NotificationBell', () => ({ default: () => null }));

const asRole = (role: 'patient' | 'doctor' | 'admin', path: string) => {
  const auth = { user: { id: 1, name: 'U', email: 'u@x', role }, role, isAuthenticated: true, isLoading: false,
    login: vi.fn(), register: vi.fn(), logout: vi.fn() } as unknown as AuthContextType;
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="patient" element={<p>patient home</p>} />
            <Route path="admin/patients" element={<p>admin patients</p>} />
            <Route path="consult/:id" element={<p>video room</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
};

describe('Layout role guard', () => {
  it("sends a patient who opens an admin page back to their own section", () => {
    asRole('patient', '/admin/patients');
    expect(screen.getByText('patient home')).toBeInTheDocument();
    expect(screen.queryByText('admin patients')).not.toBeInTheDocument();
  });
  it('lets each role open its own pages and shared ones', () => {
    asRole('admin', '/admin/patients');
    expect(screen.getByText('admin patients')).toBeInTheDocument();
  });
  it('leaves shared pages like the video room alone', () => {
    asRole('patient', '/consult/3');
    expect(screen.getByText('video room')).toBeInTheDocument();
  });
});
