import api from './api';
import type { TeleconsultJoinData } from '../types/modules';

export const teleconsultService = {
  join: (appointmentId: number) =>
    api.get<{ success: true; data: TeleconsultJoinData }>(`/teleconsult/${appointmentId}/join`),

  complete: (appointmentId: number) =>
    api.patch<{ success: true; message: string }>(`/teleconsult/${appointmentId}/complete`),
};
