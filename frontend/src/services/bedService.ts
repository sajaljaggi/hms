import api from './api';
import type {
  AllocateBedBody, ApiOk, Bed, BedListQuery, BedRequest, BedStats, BedStatus, CreateBedBody, CreateBedRequestBody,
  CreateWardBody, MyPatientBed, PatientSearchResult, Ward,
} from '../types/modules';

export const bedService = {
  getWards: () => api.get<{ success: true; data: Ward[] }>('/beds/wards'),

  createWard: (body: CreateWardBody) =>
    api.post<{ success: true; data: { id: number } }>('/beds/wards', body),

  getStats: () => api.get<{ success: true; data: BedStats }>('/beds/stats'),

  searchPatients: (q: string) =>
    api.get<{ success: true; data: PatientSearchResult[] }>('/beds/patients/search', { params: { q } }),

  getBeds: (params?: BedListQuery) =>
    api.get<{ success: true; data: Bed[] }>('/beds', { params }),

  createBed: (body: CreateBedBody) =>
    api.post<{ success: true; data: { id: number } }>('/beds', body),

  // 'occupied' is set only by allocation.
  updateStatus: (id: number, status: Exclude<BedStatus, 'occupied'>) =>
    api.patch<ApiOk>(`/beds/${id}/status`, { status }),

  allocate: (id: number, body: AllocateBedBody) =>
    api.post<{ success: true; data: { allocationId: number } }>(`/beds/${id}/allocate`, body),

  discharge: (allocationId: number) =>
    api.post<ApiOk>(`/beds/allocations/${allocationId}/discharge`),

  // Bed and discharge requests: doctors create and cancel; the admin fulfills or rejects.
  getRequests: () => api.get<{ success: true; data: BedRequest[] }>('/beds/requests'),

  createRequest: (body: CreateBedRequestBody) =>
    api.post<{ success: true; data: { id: number } }>('/beds/requests', body),

  fulfillRequest: (id: number, bedId?: number) =>
    api.post<{ success: true; data: { allocationId: number } }>(`/beds/requests/${id}/fulfill`, bedId ? { bedId } : {}),

  rejectRequest: (id: number, notes?: string) =>
    api.patch<ApiOk>(`/beds/requests/${id}/reject`, notes ? { notes } : {}),

  cancelRequest: (id: number) => api.patch<ApiOk>(`/beds/requests/${id}/cancel`),

  getMyPatients: () => api.get<{ success: true; data: MyPatientBed[] }>('/beds/my-patients'),
};
