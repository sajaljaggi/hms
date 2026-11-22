import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import api from './api';
import { chatbotService } from './chatbotService';

afterEach(() => { vi.useRealTimers(); });

describe('chatbotService', () => {
  it('offers only free, unblocked, future slots from the normal slots endpoint', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-15T10:00:00'));
    vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: [
      { id: 1, date: '2030-01-15', time: '09:45:00', is_booked: 0, is_available: 1 }, // past
      { id: 2, date: '2030-01-15', time: '10:15:00', is_booked: 1, is_available: 1 }, // booked
      { id: 3, date: '2030-01-15', time: '10:30:00', is_booked: 0, is_available: 0 }, // blocked by admin
      { id: 4, date: '2030-01-15', time: '10:45:00', is_booked: 0, is_available: 1 },
    ] } });
    const res = await chatbotService.getSlots(9, '2030-01-15');
    expect(api.get).toHaveBeenCalledWith('/slots', { params: { doctorId: 9, date: '2030-01-15' } });
    expect(res.data.data.map((s) => s.id)).toEqual([4]);
  });

  it('books through the normal booking endpoint (same rules as the booking page)', async () => {
    await chatbotService.bookAppointment(9, 4, 'cough');
    expect(api.post).toHaveBeenCalledWith('/appointments/book', { doctorId: 9, slotId: 4, reason: 'cough' });
  });
});
