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

  getDoctors: (specialization?: string) =>
    api.get<{ success: boolean; data: ChatDoctor[] }>('/chatbot/doctors', {
      params: specialization ? { specialization } : {},
    }),

  getSlots: (doctorId: number, date: string) =>
    api.get<{ success: boolean; data: ChatSlot[] }>('/chatbot/slots', {
      params: { doctorId, date },
    }),

  bookAppointment: (doctorId: number, slotId: number, reason?: string) =>
    api.post('/chatbot/book', { doctorId, slotId, reason }),

  getAppointments: (filter: string = 'all') =>
    api.get<{ success: boolean; data: ChatAppointment[] }>('/chatbot/appointments', {
      params: { filter },
    }),
};
