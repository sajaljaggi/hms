import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BedManagement from './BedManagement';
import { bedService } from '../../services/bedService';
import { useAuth } from '../../context/useAuth';
import type { Bed, BedRequest } from '../../types/modules';

vi.mock('../../services/bedService', () => ({
  bedService: {
    getWards: vi.fn(), getStats: vi.fn(), getBeds: vi.fn(), searchPatients: vi.fn(), allocate: vi.fn(),
    discharge: vi.fn(), createWard: vi.fn(), createBed: vi.fn(), updateStatus: vi.fn(),
    getRequests: vi.fn(), createRequest: vi.fn(), fulfillRequest: vi.fn(), rejectRequest: vi.fn(), cancelRequest: vi.fn(), getMyPatients: vi.fn(),
  },
}));
vi.mock('../../context/useAuth', () => ({ useAuth: vi.fn() }));

const svc = vi.mocked(bedService);
const bed = (id: number, over: Partial<Bed> = {}): Bed => ({
  id, ward_id: 1, bed_number: `B${id}`, status: 'available', daily_rate: '100', ward_name: 'ICU',
  allocation_id: null, patient_id: null, patient_name: null, admitted_at: null, discharge_request_id: null,
  discharge_requested_by: null, discharge_requested_at: null, discharge_urgency: null, discharge_reason: null, ...over,
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
  svc.getRequests.mockResolvedValue({ data: { success: true, data: [] } } as never);
  svc.getMyPatients.mockResolvedValue({ data: { success: true, data: [] } } as never);
  svc.createRequest.mockResolvedValue({ data: { success: true, data: { id: 1 } } } as never);
  svc.fulfillRequest.mockResolvedValue({ data: { success: true, data: { allocationId: 3 } } } as never);
  svc.rejectRequest.mockResolvedValue({ data: { success: true } } as never);
});

const req = (id: number, over: Partial<BedRequest> = {}): BedRequest => ({
  id, request_type: 'admission', patient_id: 7, requested_by: 1, ward_type: null, allocation_id: null, emergency_case_id: null,
  urgency: 'routine', status: 'pending', reason: null, admin_notes: null, created_at: '2030-01-01T10:00:00Z', resolved_at: null,
  patient_name: 'Pat Doe', requester_name: 'Dr Who', bed_number: null, ward_name: null, ...over,
});

describe('BedManagement', () => {
  it('shows stats and patient name on occupied beds', async () => {
    asRole('admin');
    render(<BedManagement />);
    expect(await screen.findByText('33%')).toBeInTheDocument();
    expect(screen.getByText('Occupant Olive')).toBeInTheDocument();
  });

  it('allocates a searched patient with the reason', async () => {
    asRole('admin');
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

  it('shows an allocate failure inside the dialog', async () => {
    asRole('admin');
    svc.allocate.mockRejectedValue({ response: { data: { message: 'Bed is no longer available' } } });
    render(<BedManagement />);
    await userEvent.click(await screen.findByRole('button', { name: 'Allocate' }));
    const dialog = screen.getByRole('dialog', { name: 'Allocate bed' });
    await userEvent.type(within(dialog).getByPlaceholderText(/search by name/i), 'pat');
    await userEvent.click(await within(dialog).findByRole('option', { name: /Pat Doe/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm allocation' }));
    expect(await within(dialog).findByText('Bed is no longer available')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Allocate bed' })).toBeInTheDocument();
  });

  it('confirms before discharging', async () => {
    asRole('admin');
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

  it("doctor never loads the bed grid; sees their admitted patients and asks for a discharge", async () => {
    asRole('doctor');
    svc.getMyPatients.mockResolvedValue({ data: { success: true, data: [
      { allocation_id: 9, patient_id: 4, patient_name: 'Occupant Olive', admitted_at: '2030-01-01T10:00:00Z', reason: null, bed_number: 'B2', ward_name: 'ICU', ward_type: 'icu', discharge_request_id: null },
      { allocation_id: 10, patient_id: 5, patient_name: 'Second Sam', admitted_at: '2030-01-01T10:00:00Z', reason: null, bed_number: 'B4', ward_name: 'ICU', ward_type: 'icu', discharge_request_id: 3 },
    ] } } as never);
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Recovered');
    render(<BedManagement />);
    expect(await screen.findByText('Occupant Olive')).toBeInTheDocument();
    expect(svc.getBeds).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Allocate' })).not.toBeInTheDocument();
    expect(screen.getByText('Discharge requested')).toBeInTheDocument(); // Second Sam
    await userEvent.click(screen.getByRole('button', { name: 'Request discharge' }));
    expect(svc.createRequest).toHaveBeenCalledWith({ type: 'discharge', allocationId: 9, reason: 'Recovered' });
    prompt.mockRestore();
  });

  it('doctor requests a bed for a patient', async () => {
    asRole('doctor');
    render(<BedManagement />);
    await userEvent.click(await screen.findByRole('tab', { name: 'requests' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Request a bed' }));
    const form = screen.getByRole('form', { name: 'New bed request' });
    await userEvent.type(within(form).getByPlaceholderText(/search by name/i), 'pat');
    await userEvent.click(await within(form).findByRole('option', { name: /Pat Doe/ }));
    await userEvent.selectOptions(within(form).getByLabelText('Preferred ward type'), 'icu');
    await userEvent.selectOptions(within(form).getByLabelText('Urgency'), 'urgent');
    await userEvent.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(svc.createRequest).toHaveBeenCalledWith({ type: 'admission', patientId: 7, wardType: 'icu', urgency: 'urgent', reason: undefined });
  });

  it('admin assigns a free bed to a request (preferred ward type first) or rejects it with a reason', async () => {
    asRole('admin');
    svc.getWards.mockResolvedValue({ data: { success: true, data: [{ id: 1, name: 'Gen', ward_type: 'general' }, { id: 2, name: 'ICU', ward_type: 'icu' }] } } as never);
    svc.getBeds.mockResolvedValue({ data: { success: true, data: [bed(1, { ward_name: 'Gen' }), bed(5, { ward_id: 2, ward_name: 'ICU' })] } } as never);
    svc.getRequests.mockResolvedValue({ data: { success: true, data: [req(20, { ward_type: 'icu' }), req(21, { patient_name: 'Other Ann' })] } } as never);
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('No bed free');
    render(<BedManagement />);
    await userEvent.click(await screen.findByRole('tab', { name: 'requests' }));
    const row = await screen.findByTestId('bed-request-20');
    const select = within(row).getByLabelText('Bed for Pat Doe');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a free bed', 'ICU / B5', 'Gen / B1']);
    await userEvent.selectOptions(select, '5');
    await userEvent.click(within(row).getByRole('button', { name: 'Assign bed' }));
    expect(svc.fulfillRequest).toHaveBeenCalledWith(20, 5);

    await userEvent.click(within(screen.getByTestId('bed-request-21')).getByRole('button', { name: 'Reject' }));
    expect(svc.rejectRequest).toHaveBeenCalledWith(21, 'No bed free');
    prompt.mockRestore();
  });

  it("Allocate lists doctors' bed requests (matching ward type first) and allocates the chosen patient", async () => {
    asRole('admin');
    svc.getWards.mockResolvedValue({ data: { success: true, data: [{ id: 1, name: 'ICU', ward_type: 'icu' }] } } as never);
    svc.getRequests.mockResolvedValue({ data: { success: true, data: [
      req(30, { patient_id: 31, patient_name: 'Gen Gina', urgency: 'emergency', ward_type: 'general' }),
      req(32, { patient_id: 33, patient_name: 'Icu Ivan', urgency: 'urgent', ward_type: 'icu', reason: 'Post-op' }),
      req(34, { patient_id: 35, patient_name: 'Done Dan', status: 'fulfilled' }),
      req(36, { patient_id: 37, patient_name: 'Out Otto', request_type: 'discharge' }),
    ] } } as never);
    render(<BedManagement />);
    await userEvent.click(await screen.findByRole('button', { name: 'Allocate' }));
    const dialog = screen.getByRole('dialog', { name: 'Allocate bed' });
    const options = await within(dialog).findAllByRole('button', { pressed: false });
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringMatching(/^Icu Ivan.*urgent.*icu bed.*By Dr Who · Post-op/),
      expect.stringMatching(/^Gen Gina.*emergency.*general bed/),
    ]); // only pending bed requests, this ward's type first
    await userEvent.click(options[0]);
    expect(within(dialog).getByRole('button', { name: /Icu Ivan/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm allocation' }));
    expect(svc.allocate).toHaveBeenCalledWith(1, { patientId: 33, reason: undefined });
  });

  it('marks a bed whose discharge a doctor requested, with who asked, urgency and reason', async () => {
    asRole('admin');
    svc.getBeds.mockResolvedValue({ data: { success: true, data: [
      bed(2, { status: 'occupied', allocation_id: 9, patient_id: 4, patient_name: 'Prince Jain', discharge_request_id: 12,
        discharge_requested_by: 'Dr Who', discharge_requested_at: '2030-01-01T10:00:00Z', discharge_urgency: 'urgent', discharge_reason: 'Recovered' }),
      bed(3, { status: 'occupied', allocation_id: 10, patient_id: 5, patient_name: 'Still Sick' }),
    ] } } as never);
    render(<BedManagement />);
    const requested = await screen.findByTestId('bed-2');
    expect(requested).toHaveClass('bg-violet-50');
    expect(requested).toHaveTextContent('Discharge requested');
    expect(requested).toHaveTextContent('By Dr Who');
    expect(within(requested).getByText('urgent')).toBeInTheDocument();
    expect(requested).toHaveTextContent('Recovered');
    expect(within(requested).getByRole('button', { name: 'Approve discharge' })).toBeInTheDocument();

    const other = screen.getByTestId('bed-3');
    expect(other).toHaveClass('bg-red-50');
    expect(other).not.toHaveTextContent('Discharge requested');
    expect(within(other).getByRole('button', { name: 'Discharge' })).toBeInTheDocument();
  });
});
