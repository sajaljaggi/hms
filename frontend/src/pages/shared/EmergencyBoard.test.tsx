import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmergencyBoard from './EmergencyBoard';
import { emergencyService } from '../../services/emergencyService';
import { bedService } from '../../services/bedService';
import { patientService } from '../../services/patientService';
import type { EmergencyCase } from '../../types/modules';

vi.mock('../../services/emergencyService', () => ({
  emergencyService: { getCases: vi.fn(), getStats: vi.fn(), createCase: vi.fn(), updateCase: vi.fn(), admit: vi.fn() },
}));
vi.mock('../../services/bedService', () => ({ bedService: { getBeds: vi.fn(), searchPatients: vi.fn() } }));
vi.mock('../../services/patientService', () => ({ patientService: { getDoctors: vi.fn() } }));

const svc = vi.mocked(emergencyService);
const kase = (id: number, status: EmergencyCase['status'], over: Partial<EmergencyCase> = {}): EmergencyCase => ({
  id, patient_id: null, patient_name: `Patient ${id}`, age: 30, gender: null, contact_phone: null, chief_complaint: 'Pain',
  arrival_mode: 'walk_in', triage_level: 3, heart_rate: null, resp_rate: null, bp_systolic: null, bp_diastolic: null, spo2: null,
  temperature: null, status, assigned_doctor_id: null, bed_allocation_id: null, created_by: null, arrived_at: '', closed_at: null,
  assigned_doctor_name: null, wait_minutes: 12, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  svc.getCases.mockResolvedValue({ data: { success: true, data: [kase(1, 'waiting'), kase(2, 'in_treatment', { assigned_doctor_id: 3, assigned_doctor_name: 'Dr Who' })] } } as never);
  svc.getStats.mockResolvedValue({ data: { success: true, data: { active: 2, waiting: 1, inTreatment: 1, byTriageLevel: { 1: 0, 2: 1, 3: 1, 4: 0, 5: 0 }, avgWaitMinutes: 12, admittedToday: 0 } } } as never);
  svc.updateCase.mockResolvedValue({ data: { success: true } } as never);
  svc.admit.mockResolvedValue({ data: { success: true, data: { allocationId: 1 } } } as never);
  vi.mocked(patientService.getDoctors).mockResolvedValue({ data: { success: true, data: [{ id: 3, name: 'Dr Who', specialization: 'x' }] } } as never);
  vi.mocked(bedService.getBeds).mockResolvedValue({ data: { success: true, data: [{ id: 11, ward_name: 'ICU', bed_number: 'B1' }] } } as never);
});

describe('EmergencyBoard', () => {
  it('shows stats and renders only valid transition buttons per status', async () => {
    render(<EmergencyBoard />);
    const waiting = await screen.findByTestId('case-1');
    expect(screen.getByText('12 min', { selector: 'p' })).toBeInTheDocument();
    expect(within(waiting).getByRole('button', { name: 'Start treatment' })).toBeInTheDocument();
    expect(within(waiting).queryByRole('button', { name: 'Admit' })).not.toBeInTheDocument();
    expect(within(waiting).getByRole('button', { name: 'Discharge' })).toBeInTheDocument();
    expect(within(waiting).getByRole('button', { name: 'Transfer' })).toBeInTheDocument();

    const inTreatment = screen.getByTestId('case-2');
    expect(within(inTreatment).queryByRole('button', { name: 'Start treatment' })).not.toBeInTheDocument();
    expect(within(inTreatment).getByRole('button', { name: 'Admit' })).toBeInTheDocument();
  });

  it('starts treatment via updateCase', async () => {
    render(<EmergencyBoard />);
    await userEvent.click(within(await screen.findByTestId('case-1')).getByRole('button', { name: 'Start treatment' }));
    expect(svc.updateCase).toHaveBeenCalledWith(1, { status: 'in_treatment' });
  });

  it('admits into a selected available bed', async () => {
    render(<EmergencyBoard />);
    await userEvent.click(within(await screen.findByTestId('case-2')).getByRole('button', { name: 'Admit' }));
    await userEvent.selectOptions(await screen.findByLabelText('Bed'), '11');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm admit' }));
    expect(svc.admit).toHaveBeenCalledWith(2, 11);
  });

  it('updates the suggested ESI as inputs change and lets the clinician override', async () => {
    svc.createCase.mockResolvedValue({ data: { success: true, data: { id: 9, triageLevel: 1, suggestedLevel: 3 } } } as never);
    render(<EmergencyBoard />);
    await userEvent.click(await screen.findByRole('button', { name: 'New arrival' }));
    const suggested = screen.getByTestId('suggested-esi');
    expect(suggested).toHaveTextContent('5');

    fireEvent.change(screen.getByLabelText('Expected resources'), { target: { value: '2' } });
    expect(suggested).toHaveTextContent('3');
    fireEvent.change(screen.getByLabelText('Heart rate'), { target: { value: '120' } });
    expect(suggested).toHaveTextContent('2');
    await userEvent.click(screen.getByLabelText(/high-risk/i));
    expect(suggested).toHaveTextContent('2');
    await userEvent.click(screen.getByLabelText(/immediate life-saving/i));
    expect(suggested).toHaveTextContent('1');

    await userEvent.selectOptions(screen.getByLabelText('Triage level'), '4');
    await userEvent.type(screen.getByLabelText('Patient name'), 'New Person');
    await userEvent.type(screen.getByLabelText('Chief complaint'), 'Chest pain');
    await userEvent.click(screen.getByRole('button', { name: 'Register arrival' }));
    expect(svc.createCase).toHaveBeenCalledWith(expect.objectContaining({
      patientName: 'New Person', chiefComplaint: 'Chest pain', triageLevel: 4, expectedResources: 2, heartRate: 120,
      requiresImmediateIntervention: true, highRisk: true,
    }));
  });

  it('links a registered patient so the case can later be admitted', async () => {
    svc.createCase.mockResolvedValue({ data: { success: true, data: { id: 9, triageLevel: 1, suggestedLevel: 1 } } } as never);
    vi.mocked(bedService.searchPatients).mockResolvedValue({ data: { success: true, data: [{ id: 42, name: 'Reg Patient', email: 'r@x.com', phone: null }] } } as never);
    render(<EmergencyBoard />);
    await userEvent.click(await screen.findByRole('button', { name: 'New arrival' }));
    await userEvent.type(screen.getByLabelText(/Registered patient/), 'Reg');
    await userEvent.click(await screen.findByRole('option', { name: /Reg Patient/ }));
    await userEvent.type(screen.getByLabelText('Chief complaint'), 'Collapse');
    await userEvent.click(screen.getByRole('button', { name: 'Register arrival' }));
    expect(svc.createCase).toHaveBeenCalledWith(expect.objectContaining({ patientId: 42, patientName: undefined, chiefComplaint: 'Collapse' }));
  });

  it('refetches beds and clears the selection after a failed admit', async () => {
    svc.admit.mockRejectedValue({ response: { data: { message: 'Bed already taken' } } });
    render(<EmergencyBoard />);
    await userEvent.click(within(await screen.findByTestId('case-2')).getByRole('button', { name: 'Admit' }));
    await userEvent.selectOptions(await screen.findByLabelText('Bed'), '11');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm admit' }));
    expect(await screen.findByText('Bed already taken')).toBeInTheDocument();
    expect(bedService.getBeds).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Bed')).toHaveValue('');
  });
});
