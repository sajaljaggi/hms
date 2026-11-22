import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TeleconsultRoom from './TeleconsultRoom';
import { teleconsultService } from '../../services/teleconsultService';

vi.mock('../../services/teleconsultService', () => ({ teleconsultService: { join: vi.fn(), status: vi.fn(), admit: vi.fn(), complete: vi.fn() } }));
vi.mock('../../utils/scriptLoader', () => ({ loadScript: vi.fn().mockResolvedValue(undefined) }));

const renderRoom = () => render(
  <MemoryRouter initialEntries={['/consult/7']}>
    <Routes><Route path="/consult/:appointmentId" element={<TeleconsultRoom />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => { vi.mocked(teleconsultService.join).mockReset(); vi.mocked(teleconsultService.status).mockReset(); vi.mocked(teleconsultService.admit).mockReset(); });
afterEach(() => { vi.useRealTimers(); delete (window as unknown as Record<string, unknown>).JitsiMeetExternalAPI; });

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
      waiting: false, roomName: 'r', domain: 'meet.jit.si', displayName: 'Pat', role: 'patient', startsAt: '', appointmentId: 7,
    } } } as never);
    const { unmount } = renderRoom();
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled());
    unmount();
    expect(dispose).toHaveBeenCalled();
  });

  const room = (over: object) => ({ data: { data: {
    waiting: false, roomName: 'r', domain: 'meet.jit.si', displayName: 'X', role: 'patient', startsAt: '', appointmentId: 7, ...over,
  } } }) as never;
  const withJitsi = () => {
    const ctor = vi.fn(function () { return { dispose: vi.fn() }; });
    (window as unknown as Record<string, unknown>).JitsiMeetExternalAPI = ctor;
    return ctor;
  };

  it('keeps a patient in the waiting room until admitted, then starts the call', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const ctor = withJitsi();
    vi.mocked(teleconsultService.join)
      .mockResolvedValueOnce({ data: { data: { waiting: true, role: 'patient', startsAt: '', appointmentId: 7 } } } as never)
      .mockResolvedValueOnce(room({ jwt: 'tok', domain: '8x8.vc', tenant: 'vpaas-magic-cookie-abc', roomName: 'vpaas-magic-cookie-abc/r' }));
    renderRoom();
    expect(await screen.findByText('You are in the waiting room')).toBeInTheDocument();
    expect(ctor).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    await vi.waitFor(() => expect(ctor).toHaveBeenCalled());
    expect(teleconsultService.join).toHaveBeenCalledTimes(2);
    expect(ctor.mock.calls[0]).toEqual(['8x8.vc', expect.objectContaining({ roomName: 'vpaas-magic-cookie-abc/r', jwt: 'tok' })]);
  });

  it('lets the doctor admit a waiting patient', async () => {
    withJitsi();
    vi.mocked(teleconsultService.join).mockResolvedValue(room({ role: 'doctor' }));
    vi.mocked(teleconsultService.status).mockResolvedValue({ data: { data: { admitted: false, patientWaiting: true } } } as never);
    vi.mocked(teleconsultService.admit).mockResolvedValue({} as never);
    renderRoom();
    fireEvent.click(await screen.findByRole('button', { name: 'Admit patient' }));
    expect(await screen.findByText(/Patient admitted/)).toBeInTheDocument();
    expect(teleconsultService.admit).toHaveBeenCalledWith(7);
  });

  it('rejects a malformed video account id', async () => {
    withJitsi();
    vi.mocked(teleconsultService.join).mockResolvedValue(room({ domain: '8x8.vc', tenant: '../evil' }));
    renderRoom();
    expect(await screen.findByText('Invalid video account.')).toBeInTheDocument();
  });
});
