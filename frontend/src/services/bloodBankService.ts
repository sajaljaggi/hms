import api from './api';
import type {
  ApiOk, BloodDonor, BloodInventoryRow, BloodRequest, BloodRequestStatus, BloodUnit, CreateBloodRequestBody,
  CreateDonorBody, DonationBody, DonationResult, DonorListQuery, UnitListQuery,
} from '../types/modules';

export const bloodBankService = {
  getInventory: () =>
    api.get<{ success: true; data: BloodInventoryRow[] }>('/blood/inventory'),

  getDonors: (params?: DonorListQuery) =>
    api.get<{ success: true; data: BloodDonor[] }>('/blood/donors', { params }),

  createDonor: (body: CreateDonorBody) =>
    api.post<{ success: true; data: { id: number } }>('/blood/donors', body),

  recordDonation: (body: DonationBody) =>
    api.post<{ success: true; data: DonationResult }>('/blood/donations', body),

  getUnits: (params?: UnitListQuery) =>
    api.get<{ success: true; data: BloodUnit[] }>('/blood/units', { params }),

  discardUnit: (id: number) => api.patch<ApiOk>(`/blood/units/${id}/discard`),

  createRequest: (body: CreateBloodRequestBody) =>
    api.post<{ success: true; data: { id: number } }>('/blood/requests', body),

  getRequests: (params?: { status?: BloodRequestStatus }) =>
    api.get<{ success: true; data: BloodRequest[] }>('/blood/requests', { params }),

  fulfillRequest: (id: number) =>
    api.post<{ success: true; data: { issuedUnitIds: number[] } }>(`/blood/requests/${id}/fulfill`),

  rejectRequest: (id: number, notes?: string) =>
    api.patch<ApiOk>(`/blood/requests/${id}/reject`, { notes }),

  cancelRequest: (id: number) => api.patch<ApiOk>(`/blood/requests/${id}/cancel`),
};
