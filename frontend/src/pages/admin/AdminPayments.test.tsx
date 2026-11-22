import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPayments from './AdminPayments';
import { paymentService } from '../../services/paymentService';

vi.mock('../../services/paymentService', () => ({ paymentService: { getAllPayments: vi.fn() } }));

const row = (id: number) => ({
  id, appointment_id: id, amount_paise: 50000, currency: 'INR', provider: 'mock', provider_order_id: `o${id}`,
  provider_payment_id: null, status: 'paid', paid_at: null, created_at: '2026-11-20T10:00:00.000Z',
  patient_name: `Patient ${id}`, doctor_name: 'Dr A', date: '2026-11-25T00:00:00.000Z', time: '10:00:00',
});
const pageOf = (page: number, total: number) => ({
  data: { success: true, data: [row(page)], total, page, limit: 50, summary: { totalPaidPaise: 50000, paidCount: total, pendingCount: 0 } },
});

beforeEach(() => vi.resetAllMocks());

describe('AdminPayments', () => {
  it('pages through results with Previous/Next', async () => {
    vi.mocked(paymentService.getAllPayments).mockImplementation(async (page = 1) => pageOf(page, 120) as never);
    render(<AdminPayments />);
    await screen.findByText('Patient 1');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Patient 2');
    expect(paymentService.getAllPayments).toHaveBeenLastCalledWith(2);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('hides the pager when everything fits on one page', async () => {
    vi.mocked(paymentService.getAllPayments).mockResolvedValue(pageOf(1, 3) as never);
    render(<AdminPayments />);
    await screen.findByText('Patient 1');
    expect(screen.queryByRole('navigation', { name: 'Payments pages' })).toBeNull();
  });
});
