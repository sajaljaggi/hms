import api from './api';

export const adminService = {
  getUsers:        (params: { role?: 'patient' | 'doctor' | 'admin'; q?: string; sort?: string; page?: number; limit?: number } = {}) =>
    api.get('/admin/users', { params }),
  getDoctors:      ()         => api.get('/admin/doctors'),
  getAppointments: (params: { status?: string; q?: string; page?: number; limit?: number } = {}) =>
    api.get('/admin/appointments', { params }),
  deleteUser:      (id: number) => api.delete(`/admin/user/${id}`),
  createDoctor:    (data: FormData) => api.post('/admin/doctors', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  // CRUD additions
  updateUser:        (id: number, data: object) => api.patch(`/admin/users/${id}`, data),
  updateDoctor:      (id: number, data: FormData) => api.patch(`/admin/doctors/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAppointment: (id: number) => api.delete(`/admin/appointments/${id}`),
  updateAppointment: (id: number, data: { status: string }) => api.patch(`/admin/appointments/${id}`, data),
  // Slot management
  getSlots:        (doctorId: number, date: string) => api.get('/admin/slots', { params: { doctorId, date } }),
  toggleSlot:      (slotId: number) => api.patch(`/admin/slots/${slotId}/toggle`),
  blockDay:        (doctorId: number, date: string) => api.delete('/admin/slots/day', { data: { doctorId, date } }),
  generateSlots:   (doctorId: number, date: string) => api.post('/admin/slots/generate', { doctorId, date }),
};
