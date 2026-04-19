import api from './api';

export const adminService = {
  getUsers:        (page = 1) => api.get('/admin/users', { params: { page } }),
  getDoctors:      ()         => api.get('/admin/doctors'),
  getAppointments: (status?: string) => api.get('/admin/appointments', { params: status ? { status } : {} }),
  deleteUser:      (id: number) => api.delete(`/admin/user/${id}`),
  createDoctor:    (data: object) => api.post('/admin/doctors', data),
  // CRUD additions
  updateUser:        (id: number, data: object) => api.patch(`/admin/users/${id}`, data),
  updateDoctor:      (id: number, data: object) => api.patch(`/admin/doctors/${id}`, data),
  deleteAppointment: (id: number) => api.delete(`/admin/appointments/${id}`),
  updateAppointment: (id: number, data: { status: string }) => api.patch(`/admin/appointments/${id}`, data),
  // Slot management
  getSlots:        (doctorId: number, date: string) => api.get('/admin/slots', { params: { doctorId, date } }),
  toggleSlot:      (slotId: number) => api.patch(`/admin/slots/${slotId}/toggle`),
  blockDay:        (doctorId: number, date: string) => api.delete('/admin/slots/day', { data: { doctorId, date } }),
  generateSlots:   (doctorId: number, date: string) => api.post('/admin/slots/generate', { doctorId, date }),
};
