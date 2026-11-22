import api from './api';
import type {
  CreateNavEdgeBody, CreateNavLocationBody, NavLocation, NavLocationQuery, NavRoute,
} from '../types/modules';

export const navigationService = {
  getLocations: (params?: NavLocationQuery) =>
    api.get<{ success: true; data: NavLocation[] }>('/navigation/locations', { params }),

  getRoute: (from: number, to: number, accessible = false) =>
    api.get<{ success: true; data: NavRoute }>('/navigation/route', { params: { from, to, accessible } }),

  createLocation: (body: CreateNavLocationBody) =>
    api.post<{ success: true; data: { id: number } }>('/navigation/locations', body),

  deleteLocation: (id: number) =>
    api.delete<{ success: true; data: { id: number } }>(`/navigation/locations/${id}`),

  createEdge: (body: CreateNavEdgeBody) =>
    api.post<{ success: true; data: { id: number } }>('/navigation/edges', body),

  deleteEdge: (id: number) =>
    api.delete<{ success: true; data: { id: number } }>(`/navigation/edges/${id}`),
};
