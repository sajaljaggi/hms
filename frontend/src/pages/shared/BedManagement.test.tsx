import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BedManagement from './BedManagement';
import { bedService } from '../../services/bedService';
import { useAuth } from '../../context/useAuth';
import type { Bed } from '../../types/modules';

vi.mock('../../services/bedService', () => ({
  bedService: {
    getWards: vi.fn(), getStats: vi.fn(), getBeds: vi.fn(), searchPatients: vi.fn(), allocate: vi.fn(),
    discharge: vi.fn(), createWard: vi.fn(), createBed: vi.fn(), updateStatus: vi.fn(),
  },
}));
vi.mock('../../context/useAuth', () => ({ useAuth: vi.fn() }));

const svc = vi.mocked(bedService);
const bed = (id: number, over: Partial<Bed> = {}): Bed => ({
  id, ward_id: 1, bed_number: `B${id}`, status: 'available', daily_rate: '100', ward_name: 'ICU',
  allocation_id: null, patient_id: null, patient_name: null, admitted_at: null, ...over,
});
const asRole = (role: 'admin' | 'doctor') =>
  vi.mocked(useAuth).mockReturnValue({ user: { id: 1, name: 'U', email: 'u@x', role }, role } as never);

beforeEach(() => {
  vi.resetAllMocks();
  svc.getWards.mockResolvedValue({ data: { success: true, data: [{ id: 1, name: 'ICU' }] } } as never);
  svc.getStats.mockResolvedValue({ data: { success: true, data: { total: 3, available: 1, occupied: 1, maintenance: 1, reserved: 0, occupancyRate: 33 } } } as never);
  svc.getBeds.mockResolvedValue({ data: { success: true, data: [
    bed(1),
    bed(2, { status: 'occupied', allocation_id: 9, patient_id: 4, patient_name: 'Occupant Olive' }),
    bed(3, { status: 'maintenance' }),
  ] } } as never);
  svc.searchPatients.mockResolvedValue({ data: { success: true, data: [{ id: 7, name: 'Pat Doe', email: 'pat@x', phone: null }] } } as never);
  svc.allocate.mockResolvedValue({ data: { success: true, data: { allocationId: 1 } } } as never);
  svc.discharge.mockResolvedValue({ data: { success: true } } as never);
});

describe('BedManagement', () => {
  it('shows stats and patient name on occupied beds', async () => {
    asRole('admin');
    render(<BedManagement />);
    expect(await screen.findByText('33%')).toBeInTheDocument();
    expect(screen.getByText('Occupant Olive')).toBeInTheDocument();
  });

  it('allocates a searched patient with the reason', async () => {
    asRole('doctor');
    render(<BedManagement />);
    await userEvent.click(await screen.findByRole('button', { name: 'Allocate' }));
    const dialog = screen.getByRole('dialog', { name: 'Allocate bed' });
    await userEvent.type(within(dialog).getByPlaceholderText(/search by name/i), 'pat');
    await userEvent.click(await within(dialog).findByRole('option', { name: /Pat Doe/ }));
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Observation');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm allocation' }));
    expect(svc.allocate).toHaveBeenCalledWith(1, { patientId: 7, reason: 'Observation' });
    expect(svc.searchPatients).toHaveBeenCalledWith('pat');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirms before discharging', async () => {
    asRole('doctor');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<BedManagement />);
    const btn = await screen.findByRole('button', { name: 'Discharge' });
    await userEvent.click(btn);
    expect(svc.discharge).not.toHaveBeenCalled();
    await userEvent.click(btn);
    expect(svc.discharge).toHaveBeenCalledWith(9);
    confirm.mockRestore();
  });

  it('shows admin-only controls to admin', async () => {
    asRole('admin');
    render(<BedManagement />);
    expect(await screen.findByRole('button', { name: /Add ward/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add bed/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Set status for B1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Set status for B2')).not.toBeInTheDocument(); // occupied
  });

  it('hides admin-only controls from doctor', async () => {
    asRole('doctor');
    render(<BedManagement />);
    await screen.findByText('33%');
    expect(screen.queryByRole('button', { name: /Add ward/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add bed/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument();
  });
});
