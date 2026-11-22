import api from './api';
import type {
  AdminPaymentRow, CreateOrderData, MyPaymentRow, PaymentStatus, PaymentSummary, VerifyPaymentBody, VerifyPaymentData,
} from '../types/modules';

export const paymentService = {
  createOrder: (appointmentId: number) =>
    api.post<{ success: true; data: CreateOrderData }>('/payments/orders', { appointmentId }),

  verify: (body: VerifyPaymentBody) =>
    api.post<{ success: true; data: VerifyPaymentData }>('/payments/verify', body),

  failOrder: (orderId: string) =>
    api.post<{ success: true; data: { status: PaymentStatus } }>(`/payments/orders/${orderId}/fail`),

  getMyPayments: () =>
    api.get<{ success: true; data: MyPaymentRow[] }>('/payments/my'),

  getAllPayments: (page = 1) =>
    api.get<{ success: true; data: AdminPaymentRow[]; total: number; page: number; limit: number; summary: PaymentSummary }>(
      '/payments', { params: { page } }),
};
