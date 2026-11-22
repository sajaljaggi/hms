import api from './api';

export const patientService = {
  getProfile:       ()                          => api.get('/patient/profile'),
  updateProfile:    (data: object)              => api.put('/patient/profile', data),
  getAppointments:  ()                          => api.get('/patient/appointments'),
  cancelAppointment: (id: number)              => api.post<{ success: true; message: string; data: { refundDue: boolean } }>(`/patient/appointments/${id}/cancel`),
  getMedicalHistory:()                          => api.get('/patient/medical-history'),
  getDoctors:       (specialization?: string)   => api.get('/doctors', { params: specialization ? { specialization } : {} }),
  getAvailableSlots:(doctorId: number, date: string) => api.get('/slots', { params: { doctorId, date } }),
  bookAppointment:  (doctorId: number, slotId: number, reason?: string, consultationType: 'in_person' | 'video' = 'in_person') =>
    api.post('/appointments/book', { doctorId, slotId, reason, consultationType }),
  submitRating:     (appointmentId: number, stars: number) => api.post('/patient/rate', { appointmentId, stars }),
};
