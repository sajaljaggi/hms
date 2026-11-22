import api from './api';
import type {
  ApiOk, CreateEmergencyCaseBody, CreateEmergencyCaseResult, EmergencyCase, EmergencyCaseFilter, EmergencyStats,
  UpdateEmergencyCaseBody,
} from '../types/modules';

export const emergencyService = {
  getStats: () => api.get<{ success: true; data: EmergencyStats }>('/emergency/stats'),

  createCase: (body: CreateEmergencyCaseBody) =>
    api.post<{ success: true; data: CreateEmergencyCaseResult }>('/emergency/cases', body),

  getCases: (status?: EmergencyCaseFilter) =>
    api.get<{ success: true; data: EmergencyCase[] }>('/emergency/cases', { params: { status } }),

  getCase: (id: number) =>
    api.get<{ success: true; data: EmergencyCase }>(`/emergency/cases/${id}`),

  updateCase: (id: number, body: UpdateEmergencyCaseBody) =>
    api.patch<ApiOk>(`/emergency/cases/${id}`, body),

  admit: (id: number, bedId: number) =>
    api.post<{ success: true; data: { allocationId: number } }>(`/emergency/cases/${id}/admit`, { bedId }),
};
