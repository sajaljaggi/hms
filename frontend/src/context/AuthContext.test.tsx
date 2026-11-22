import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthProvider } from './AuthContext';
import { authService } from '../services/authService';

vi.mock('../services/authService', () => ({ authService: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() } }));

beforeEach(() => { localStorage.clear(); });

describe('AuthProvider', () => {
  it('keeps only id, name, email and role in localStorage, never the medical profile', async () => {
    vi.mocked(authService.me).mockResolvedValue({ data: { user: {
      id: 5, name: 'Asha', email: 'a@x', role: 'patient', medical_history: 'asthma', address: '12 Main St', phone: '900',
    } } } as never);
    render(<AuthProvider><p>app</p></AuthProvider>);
    await waitFor(() => expect(localStorage.getItem('hms_user')).not.toBeNull());
    expect(JSON.parse(localStorage.getItem('hms_user')!)).toEqual({ id: 5, name: 'Asha', email: 'a@x', role: 'patient' });
  });
});
