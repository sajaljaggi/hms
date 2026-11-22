import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BloodBank from './BloodBank';
import { bloodBankService } from '../../services/bloodBankService';
import { useAuth } from '../../context/useAuth';

vi.mock('../../services/bloodBankService', () => ({
  bloodBankService: {
    getInventory: vi.fn(), getRequests: vi.fn(), getDonors: vi.fn(), getUnits: vi.fn(), fulfillRequest: vi.fn(),
    rejectRequest: vi.fn(), cancelRequest: vi.fn(), createRequest: vi.fn(), createDonor: vi.fn(), recordDonation: vi.fn(), discardUnit: vi.fn(),
  },
}));
vi.mock('../../services/bedService', () => ({ bedService: { searchPatients: vi.fn() } }));
vi.mock('../../context/useAuth', () => ({ useAuth: vi.fn() }));

const svc = vi.mocked(bloodBankService);
const asRole = (role: 'admin' | 'doctor', id = 1) =>
  vi.mocked(useAuth).mockReturnValue({ user: { id, name: 'U', email: 'u@x', role }, role } as never);

const request = { id: 5, patient_id: 2, requested_by: 1, blood_group: 'O+', component: 'packed_rbc', units_requested: 3, urgency: 'urgent', status: 'pending', notes: null, created_at: '', fulfilled_at: null, patient_name: 'Pat', requester_name: 'Dr' };

beforeEach(() => {
  vi.resetAllMocks();
  svc.getInventory.mockResolvedValue({ data: { success: true, data: [
    { blood_group: 'A+', component: 'plasma', available: 12, expiring_soon: 2 },
    { blood_group: 'O-', component: 'platelets', available: 3, expiring_soon: 0 },
  ] } } as never);
  svc.getRequests.mockResolvedValue({ data: { success: true, data: [request] } } as never);
});

describe('BloodBank', () => {
  it('renders zero-filled cells and highlights low stock', async () => {
    asRole('admin');
    render(<BloodBank />);
    const ok = await screen.findByTestId('inv-A+-plasma');
    expect(ok).toHaveTextContent('12');
    expect(ok).toHaveTextContent('2 expiring');
    expect(ok).toHaveAttribute('data-low', 'false');
    const low = screen.getByTestId('inv-O--platelets');
    expect(low).toHaveTextContent('3');
    expect(low).toHaveAttribute('data-low', 'true');
    const missing = screen.getByTestId('inv-B+-whole_blood');
    expect(missing).toHaveTextContent('0');
    expect(missing).toHaveAttribute('data-low', 'true');
    expect(screen.getAllByTestId(/^inv-/)).toHaveLength(32);
  });

  it('hides Donors and Units tabs from doctor', async () => {
    asRole('doctor');
    render(<BloodBank />);
    await screen.findByTestId('inv-A+-plasma');
    expect(screen.getByRole('tab', { name: 'requests' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'donors' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'units' })).not.toBeInTheDocument();
  });

  it('shows Donors and Units tabs to admin', async () => {
    asRole('admin');
    render(<BloodBank />);
    expect(await screen.findByRole('tab', { name: 'donors' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'units' })).toBeInTheDocument();
  });

  it('requester sees Cancel but not Fulfill/Reject', async () => {
    asRole('doctor', 1);
    render(<BloodBank />);
    await userEvent.click(await screen.findByRole('tab', { name: 'requests' }));
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fulfill' })).not.toBeInTheDocument();
  });

  it('shows the 409 insufficient-stock message inline on fulfill', async () => {
    asRole('admin', 99);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    svc.fulfillRequest.mockRejectedValue({ response: { data: { message: 'Insufficient stock: 1 of 3 units available' } } });
    render(<BloodBank />);
    await userEvent.click(await screen.findByRole('tab', { name: 'requests' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Fulfill' }));
    expect(await screen.findByText('Insufficient stock: 1 of 3 units available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument(); // not the requester
  });

  it('does not fulfill when the confirm is declined', async () => {
    asRole('admin', 99);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BloodBank />);
    await userEvent.click(await screen.findByRole('tab', { name: 'requests' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Fulfill' }));
    expect(svc.fulfillRequest).not.toHaveBeenCalled();
  });

  it('shows only the error when the inventory fetch fails', async () => {
    asRole('admin');
    svc.getInventory.mockRejectedValue({ response: { data: { message: 'boom' } } });
    render(<BloodBank />);
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^inv-/)).toHaveLength(0);
  });
});
