import api from './api';

export interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
}

export interface ChatAction {
  type: 'RECOMMEND_SPECIALIZATION' | 'START_BOOKING' | 'SHOW_DOCTORS' | 'SHOW_APPOINTMENTS';
  specialization?: string;
  filter?: 'upcoming' | 'past' | 'all';
}

export interface ChatResponse {
  message: string;
  action: ChatAction | null;
}

export interface ChatDoctor {
  id: number;
  name: string;
  specialization: string;
  fees: number;
}

export interface ChatSlot {
  id: number;
  date: string;
  time: string;
}

export interface ChatAppointment {
  id: number;
  status: string;
  reason: string | null;
  created_at: string;
  date: string;
  time: string;
  doctor_name: string;
  specialization: string;
  fees: string;
}

export const chatbotService = {
  sendMessage: (message: string, history: { role: string; content: string }[]) =>
    api.post<{ success: boolean; data: ChatResponse }>('/chatbot/message', { message, history }),

  // Doctors, slots and booking use the same endpoints (and booking rules) as the booking page.
  getDoctors: (specialization?: string) =>
    api.get<{ success: boolean; data: ChatDoctor[] }>('/doctors', {
      params: specialization ? { specialization } : {},
    }),

  // Only slots a patient can actually book: free, not blocked by the admin, and not already past.
  getSlots: async (doctorId: number, date: string) => {
    const res = await api.get<{ success: boolean; data: (ChatSlot & { is_booked: number; is_available: number })[] }>('/slots', {
      params: { doctorId, date },
    });
    const now = Date.now();
    const bookable = res.data.data.filter((s) => !s.is_booked && s.is_available && new Date(`${date}T${s.time}`).getTime() > now);
    return { data: { ...res.data, data: bookable as ChatSlot[] } };
  },

  bookAppointment: (doctorId: number, slotId: number, reason?: string) =>
    api.post('/appointments/book', { doctorId, slotId, reason }),

  getAppointments: (filter: string = 'all') =>
    api.get<{ success: boolean; data: ChatAppointment[] }>('/chatbot/appointments', {
      params: { filter },
    }),
};
