import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import History from './History';
import BookAppointment from './BookAppointment';
import { patientService } from '../../services/patientService';
import { paymentService } from '../../services/paymentService';

vi.mock('../../services/patientService', () => ({
  patientService: { getAppointments: vi.fn(), getDoctors: vi.fn(), getAvailableSlots: vi.fn(), bookAppointment: vi.fn() },
}));
vi.mock('../../services/paymentService', () => ({
  paymentService: { createOrder: vi.fn(), verify: vi.fn(), failOrder: vi.fn() },
}));

const appt = (id: number, over: object) => ({
  id, status: 'pending', date: '2026-11-25T00:00:00.000Z', time: '10:00:00', doctor_name: `Dr ${id}`,
  specialization: 'Cardiology', fees: 500, payment_status: 'unpaid', consultation_type: 'in_person', ...over,
});

beforeEach(() => { vi.resetAllMocks(); });

describe('History', () => {
  it('shows Pay only for unpaid non-cancelled and Join only for paid video pending', async () => {
    vi.mocked(patientService.getAppointments).mockResolvedValue({ data: { data: [
      appt(1, {}),
      appt(2, { status: 'cancelled' }),
      appt(3, { payment_status: 'paid', consultation_type: 'video' }),
      appt(4, { payment_status: 'paid', consultation_type: 'video', status: 'completed' }),
      appt(5, { consultation_type: 'video' }),
    ] } } as never);
    render(<MemoryRouter><History /></MemoryRouter>);
    await screen.findByText('Dr 1');
    expect(screen.getAllByRole('button', { name: /^Pay/ })).toHaveLength(2); // appts 1 and 5
    expect(screen.getAllByRole('link', { name: /Join video/ })).toHaveLength(1);
  });

  it('mock pay flow verifies with the mock signature', async () => {
    vi.mocked(patientService.getAppointments).mockResolvedValue({ data: { data: [appt(1, {})] } } as never);
    vi.mocked(paymentService.createOrder).mockResolvedValue({ data: { data: {
      orderId: 'o1', amount: 50000, currency: 'INR', mode: 'mock', appointmentId: 1, mock: { paymentId: 'p1', signature: 'sig' },
    } } } as never);
    vi.mocked(paymentService.verify).mockResolvedValue({ data: { data: {} } } as never);
    render(<MemoryRouter><History /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Pay ₹500/ }));
    expect(await screen.findByText(/no money moves/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));
    await waitFor(() => expect(paymentService.verify).toHaveBeenCalledWith({ orderId: 'o1', paymentId: 'p1', signature: 'sig' }));
    expect(await screen.findByText('Test payment successful.')).toBeInTheDocument();
  });
});

describe('History date filter and razorpay dismiss', () => {
  it('matches an ISO UTC value to its local date', async () => {
    const d = new Date(2026, 10, 22); // local 22 Nov
    vi.mocked(patientService.getAppointments).mockResolvedValue({ data: { data: [appt(1, { date: d.toISOString() })] } } as never);
    const { container } = render(<MemoryRouter><History /></MemoryRouter>);
    await screen.findByText('Dr 1');
    const input = container.querySelector('input[type="date"]')!;
    await userEvent.type(input, '2026-11-22');
    expect(screen.getByText('Dr 1')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, '2026-11-23');
    expect(screen.queryByText('Dr 1')).not.toBeInTheDocument();
  });

  it('razorpay dismiss calls failOrder once, even after payment.failed', async () => {
    vi.mocked(patientService.getAppointments).mockResolvedValue({ data: { data: [appt(1, {})] } } as never);
    vi.mocked(paymentService.createOrder).mockResolvedValue({ data: { data: {
      orderId: 'o1', amount: 50000, currency: 'INR', mode: 'razorpay', appointmentId: 1, keyId: 'k',
    } } } as never);
    vi.mocked(paymentService.failOrder).mockResolvedValue({} as never);
    let opts: { modal: { ondismiss: () => void } } | undefined;
    const handlers: Record<string, () => void> = {};
    (window as unknown as Record<string, unknown>).Razorpay = function (o: typeof opts) { opts = o; return { open: vi.fn(), on: (e: string, cb: () => void) => { handlers[e] = cb; } }; };
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => { setTimeout(() => (el as HTMLScriptElement).onload?.(new Event('load')), 0); return el; });
    try {
      render(<MemoryRouter><History /></MemoryRouter>);
      await userEvent.click(await screen.findByRole('button', { name: /Pay ₹500/ }));
      await waitFor(() => expect(opts).toBeDefined());
      handlers['payment.failed']();
      expect(paymentService.failOrder).not.toHaveBeenCalled();
      opts!.modal.ondismiss();
      opts!.modal.ondismiss();
      await waitFor(() => expect(paymentService.failOrder).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('Payment failed.')).toBeInTheDocument();
    } finally {
      delete (window as unknown as Record<string, unknown>).Razorpay;
      vi.restoreAllMocks();
    }
  });
});

describe('BookAppointment', () => {
  it('sends consultationType video', async () => {
    vi.mocked(patientService.getDoctors).mockResolvedValue({ data: { data: [{ id: 9, name: 'Dr Nine', fees: 400, specialization: 'Cardiology' }] } } as never);
    vi.mocked(patientService.getAvailableSlots).mockResolvedValue({ data: { data: [{ id: 3, time: '10:00:00', is_booked: 0, is_available: 1 }] } } as never);
    vi.mocked(patientService.bookAppointment).mockResolvedValue({} as never);
    render(<BookAppointment />);
    await userEvent.click(screen.getByText('Cardiology'));
    const dayButtons = screen.getAllByRole('button').filter(b => /^[A-Z][a-z]{2}\d{2}[A-Z][a-z]{2}$/.test(b.textContent ?? ''));
    await userEvent.click(dayButtons[1]);
    await userEvent.click(await screen.findByText('Dr Nine'));
    await userEvent.click(await screen.findByText(/10:00 AM/));
    await userEvent.click(screen.getByRole('button', { name: 'Video' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Booking' }));
    expect(patientService.bookAppointment).toHaveBeenCalledWith(9, 3, '', 'video');
  });
});
