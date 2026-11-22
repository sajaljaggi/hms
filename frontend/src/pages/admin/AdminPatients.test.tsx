import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPatients from './AdminPatients';
import { adminService } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({ adminService: { getUsers: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn() } }));

const patient = (id: number, name: string) => ({
  id, name, email: `p${id}@x.com`, role: 'patient', phone: '9', city: 'Kolkata', age: 30, gender: null,
  address: null, guardian_name: null, medical_history: null, created_at: '2026-11-01T10:00:00.000Z',
});

beforeEach(() => vi.resetAllMocks());

describe('AdminPatients', () => {
  it('asks the server for patients page by page and searches on the server', async () => {
    vi.mocked(adminService.getUsers).mockImplementation(async (params = {}) => ({
      data: { success: true, total: 45, page: params.page, limit: 20,
        data: params.q ? [patient(99, 'Found Farah')] : [patient(params.page ?? 1, `Patient page ${params.page}`)] },
    }) as never);
    render(<AdminPatients />);
    expect(await screen.findByText('Patient page 1')).toBeInTheDocument();
    expect(screen.getByText('45 patients')).toBeInTheDocument(); // the server's total, not one page's length
    expect(adminService.getUsers).toHaveBeenLastCalledWith({ role: 'patient', q: undefined, sort: 'name-asc', page: 1, limit: 20 });

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Patient page 2')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Search by name/), 'Farah');
    expect(await screen.findByText('Found Farah', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(adminService.getUsers).toHaveBeenLastCalledWith({ role: 'patient', q: 'Farah', sort: 'name-asc', page: 1, limit: 20 });
  });
});
