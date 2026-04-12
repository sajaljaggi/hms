import api from './api';

export const doctorService = {
  getAppointments: (filters?: { date?: string; patient?: string }) =>
    api.get('/doctor/appointments', { params: filters }),

  updateStatus: (appointmentId: number, status: string) =>
    api.put('/doctor/appointment-status', { appointmentId, status }),

  createPrescription: (formData: FormData) =>
    api.post('/doctor/prescription', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  createSlots: (slots: { date: string; time: string }[]) =>
    api.post('/doctor/slots', { slots }),

  getDashboardStats: () =>
    api.get('/doctor/dashboard'),
};
