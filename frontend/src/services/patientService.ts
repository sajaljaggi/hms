import api from './api';

export const patientService = {
  getProfile:       ()                          => api.get('/patient/profile'),
  updateProfile:    (data: object)              => api.put('/patient/profile', data),
  getAppointments:  ()                          => api.get('/patient/appointments'),
  getMedicalHistory:()                          => api.get('/patient/medical-history'),
  getDoctors:       (specialization?: string)   => api.get('/doctors', { params: specialization ? { specialization } : {} }),
  getAvailableSlots:(doctorId: number, date: string) => api.get('/slots', { params: { doctorId, date } }),
  bookAppointment:  (doctorId: number, slotId: number, reason?: string) => api.post('/appointments/book', { doctorId, slotId, reason }),
  submitRating:     (appointmentId: number, rating: number) => api.post('/ratings', { appointmentId, rating }),
  checkRating:      (appointmentId: number) => api.get(`/ratings/check/${appointmentId}`),
};
