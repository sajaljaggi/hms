import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TeleconsultRoom from './TeleconsultRoom';
import { teleconsultService } from '../../services/teleconsultService';

vi.mock('../../services/teleconsultService', () => ({ teleconsultService: { join: vi.fn(), complete: vi.fn() } }));
vi.mock('../../utils/scriptLoader', () => ({ loadScript: vi.fn().mockResolvedValue(undefined) }));

const renderRoom = () => render(
  <MemoryRouter initialEntries={['/consult/7']}>
    <Routes><Route path="/consult/:appointmentId" element={<TeleconsultRoom />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => { vi.mocked(teleconsultService.join).mockReset(); });
afterEach(() => { delete (window as unknown as Record<string, unknown>).JitsiMeetExternalAPI; });

describe('TeleconsultRoom', () => {
  it('shows payment required on 402', async () => {
    vi.mocked(teleconsultService.join).mockImplementation(() => Promise.reject(Object.assign(new Error('Pay first'), { response: { status: 402, data: { message: 'Pay first', error: { code: 'PAYMENT_REQUIRED' } } } })));
    renderRoom();
    expect(await screen.findByText('Payment required')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /appointment history/i })).toHaveAttribute('href', '/patient/history');
  });

  it('disposes the Jitsi api on unmount', async () => {
    const dispose = vi.fn();
    const ctor = vi.fn(function () { return { dispose }; });
    (window as unknown as Record<string, unknown>).JitsiMeetExternalAPI = ctor;
    vi.mocked(teleconsultService.join).mockResolvedValue({ data: { data: {
      roomName: 'r', domain: 'meet.jit.si', displayName: 'Pat', role: 'patient', startsAt: '', appointmentId: 7,
    } } } as never);
    const { unmount } = renderRoom();
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled());
    unmount();
    expect(dispose).toHaveBeenCalled();
  });
});
