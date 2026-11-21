import api from './api';
import type { ApiOk, NotificationListResponse, NotificationQuery } from '../types/modules';

export const notificationService = {
  list: (params?: NotificationQuery) =>
    api.get<NotificationListResponse>('/notifications', { params }),

  markRead: (id: number) =>
    api.patch<ApiOk>(`/notifications/${id}/read`),

  markAllRead: () =>
    api.patch<ApiOk & { updated: number }>('/notifications/read-all'),
};
