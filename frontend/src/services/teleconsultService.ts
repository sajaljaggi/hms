import api from './api';
import type { TeleconsultJoinData, TeleconsultStatus } from '../types/modules';

export const teleconsultService = {
  join: (appointmentId: number) =>
    api.get<{ success: true; data: TeleconsultJoinData }>(`/teleconsult/${appointmentId}/join`),

  status: (appointmentId: number) =>
    api.get<{ success: true; data: TeleconsultStatus }>(`/teleconsult/${appointmentId}/status`),

  admit: (appointmentId: number) =>
    api.post<{ success: true; message: string }>(`/teleconsult/${appointmentId}/admit`),

  complete: (appointmentId: number) =>
    api.patch<{ success: true; message: string }>(`/teleconsult/${appointmentId}/complete`),
};
