import api from './api';

export const adminService = {
  getUsers:        (page = 1) => api.get('/admin/users', { params: { page } }),
  getDoctors:      ()         => api.get('/admin/doctors'),
  getAppointments: (status?: string) => api.get('/admin/appointments', { params: status ? { status } : {} }),
  deleteUser:      (id: number) => api.delete(`/admin/user/${id}`),
  createDoctor:    (data: object) => api.post('/admin/doctors', data),
};
