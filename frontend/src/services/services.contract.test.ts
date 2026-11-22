import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from './api';
import { notificationService } from './notificationService';
import { bedService } from './bedService';
import { bloodBankService } from './bloodBankService';
import { emergencyService } from './emergencyService';
import { paymentService } from './paymentService';
import { teleconsultService } from './teleconsultService';
import { navigationService } from './navigationService';

type Method = 'get' | 'post' | 'patch' | 'delete';
const m = vi.mocked(api) as unknown as Record<Method, ReturnType<typeof vi.fn>>;

// [label, call, method, url, body-or-params (undefined = not checked)]
const cases: [string, () => unknown, Method, string, unknown?][] = [
  ['notifications.list', () => notificationService.list({ limit: 10 }), 'get', '/notifications', { params: { limit: 10 } }],
  ['notifications.markRead', () => notificationService.markRead(5), 'patch', '/notifications/5/read'],
  ['notifications.markAllRead', () => notificationService.markAllRead(), 'patch', '/notifications/read-all'],

  ['beds.getWards', () => bedService.getWards(), 'get', '/beds/wards'],
  ['beds.createWard', () => bedService.createWard({ name: 'W', wardType: 'icu' }), 'post', '/beds/wards', { name: 'W', wardType: 'icu' }],
  ['beds.getStats', () => bedService.getStats(), 'get', '/beds/stats'],
  ['beds.searchPatients', () => bedService.searchPatients('jo'), 'get', '/beds/patients/search', { params: { q: 'jo' } }],
  ['beds.getBeds', () => bedService.getBeds({ wardId: 1 }), 'get', '/beds', { params: { wardId: 1 } }],
  ['beds.createBed', () => bedService.createBed({ wardId: 1, bedNumber: 'A1' }), 'post', '/beds', { wardId: 1, bedNumber: 'A1' }],
  ['beds.updateStatus', () => bedService.updateStatus(3, 'maintenance'), 'patch', '/beds/3/status', { status: 'maintenance' }],
  ['beds.allocate', () => bedService.allocate(3, { patientId: 9 }), 'post', '/beds/3/allocate', { patientId: 9 }],
  ['beds.discharge', () => bedService.discharge(4), 'post', '/beds/allocations/4/discharge'],

  ['blood.getInventory', () => bloodBankService.getInventory(), 'get', '/blood/inventory'],
  ['blood.getDonors', () => bloodBankService.getDonors({ q: 'a' }), 'get', '/blood/donors', { params: { q: 'a' } }],
  ['blood.createDonor', () => bloodBankService.createDonor({ name: 'D', bloodGroup: 'O+', phone: '12345' }), 'post', '/blood/donors'],
  ['blood.recordDonation', () => bloodBankService.recordDonation({ donorId: 1, component: 'plasma', volumeMl: 200 }), 'post', '/blood/donations'],
  ['blood.getUnits', () => bloodBankService.getUnits(), 'get', '/blood/units'],
  ['blood.discardUnit', () => bloodBankService.discardUnit(2), 'patch', '/blood/units/2/discard'],
  ['blood.createRequest', () => bloodBankService.createRequest({ patientId: 1, bloodGroup: 'A+', component: 'plasma', unitsRequested: 1 }), 'post', '/blood/requests'],
  ['blood.getRequests', () => bloodBankService.getRequests({ status: 'pending' }), 'get', '/blood/requests', { params: { status: 'pending' } }],
  ['blood.fulfillRequest', () => bloodBankService.fulfillRequest(6), 'post', '/blood/requests/6/fulfill'],
  ['blood.rejectRequest', () => bloodBankService.rejectRequest(6, 'no stock'), 'patch', '/blood/requests/6/reject', { notes: 'no stock' }],
  ['blood.cancelRequest', () => bloodBankService.cancelRequest(6), 'patch', '/blood/requests/6/cancel'],

  ['emergency.getStats', () => emergencyService.getStats(), 'get', '/emergency/stats'],
  ['emergency.createCase', () => emergencyService.createCase({ patientName: 'X', chiefComplaint: 'pain' }), 'post', '/emergency/cases'],
  ['emergency.getCases', () => emergencyService.getCases('all'), 'get', '/emergency/cases', { params: { status: 'all' } }],
  ['emergency.getCase', () => emergencyService.getCase(8), 'get', '/emergency/cases/8'],
  ['emergency.updateCase', () => emergencyService.updateCase(8, { status: 'in_treatment' }), 'patch', '/emergency/cases/8', { status: 'in_treatment' }],
  ['emergency.admit', () => emergencyService.admit(8, 2), 'post', '/emergency/cases/8/admit', { bedId: 2 }],

  ['payments.createOrder', () => paymentService.createOrder(11), 'post', '/payments/orders', { appointmentId: 11 }],
  ['payments.verify', () => paymentService.verify({ orderId: 'o', paymentId: 'p', signature: 'ab' }), 'post', '/payments/verify', { orderId: 'o', paymentId: 'p', signature: 'ab' }],
  ['payments.failOrder', () => paymentService.failOrder('order_1'), 'post', '/payments/orders/order_1/fail'],
  ['payments.getMyPayments', () => paymentService.getMyPayments(), 'get', '/payments/my'],
  ['payments.getAllPayments', () => paymentService.getAllPayments(3), 'get', '/payments', { params: { page: 3 } }],

  ['teleconsult.join', () => teleconsultService.join(12), 'get', '/teleconsult/12/join'],
  ['teleconsult.complete', () => teleconsultService.complete(12), 'patch', '/teleconsult/12/complete'],

  ['navigation.getLocations', () => navigationService.getLocations({ category: 'ward' }), 'get', '/navigation/locations', { params: { category: 'ward' } }],
  ['navigation.getRoute', () => navigationService.getRoute(1, 2, true), 'get', '/navigation/route', { params: { from: 1, to: 2, accessible: true } }],
  ['navigation.createLocation', () => navigationService.createLocation({ code: 'A', name: 'A', category: 'ward', floor: 0 }), 'post', '/navigation/locations'],
  ['navigation.deleteLocation', () => navigationService.deleteLocation(3), 'delete', '/navigation/locations/3'],
  ['navigation.createEdge', () => navigationService.createEdge({ fromLocationId: 1, toLocationId: 2, distanceM: 5, instruction: 'a', reverseInstruction: 'b' }), 'post', '/navigation/edges'],
  ['navigation.deleteEdge', () => navigationService.deleteEdge(3), 'delete', '/navigation/edges/3'],
];

describe('service contracts', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(cases)('%s', (_label, call, method, url, extra) => {
    call();
    expect(m[method]).toHaveBeenCalledTimes(1);
    const args = m[method].mock.calls[0];
    expect(args[0]).toBe(url);
    if (extra !== undefined) {
      expect(args[1]).toEqual(extra);
    }
  });
});
