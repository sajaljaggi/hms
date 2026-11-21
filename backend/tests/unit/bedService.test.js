const { allocateBed, dischargeAllocation } = require('../../services/bedService');
const { NotFoundError, ConflictError } = require('../../utils/errors');

// Queues one [rows] result per conn.query call, in order.
const connWith = (...results) => {
  const query = jest.fn();
  results.forEach((r) => query.mockResolvedValueOnce([r]));
  return { query, beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
};
const args = { bedId: 5, patientId: 9, reason: 'obs', allocatedBy: 1 };

describe('allocateBed', () => {
  test('missing bed -> NotFoundError', async () => {
    await expect(allocateBed(connWith([]), args)).rejects.toBeInstanceOf(NotFoundError);
  });
  test('bed not available -> ConflictError', async () => {
    await expect(allocateBed(connWith([{ id: 5, ward_id: 2, status: 'occupied' }]), args)).rejects.toBeInstanceOf(ConflictError);
  });
  test('unknown patient -> NotFoundError', async () => {
    await expect(allocateBed(connWith([{ id: 5, ward_id: 2, status: 'available' }], []), args)).rejects.toBeInstanceOf(NotFoundError);
  });
  test('patient already admitted -> ConflictError, nothing written', async () => {
    const conn = connWith([{ id: 5, ward_id: 2, status: 'available' }], [{ id: 9 }], [{ id: 1 }]);
    await expect(allocateBed(conn, args)).rejects.toThrow('Patient already admitted');
    expect(conn.query).toHaveBeenCalledTimes(3);
  });
  test('success inserts, occupies the bed, and never manages the transaction', async () => {
    const conn = connWith([{ id: 5, ward_id: 2, status: 'available' }], [{ id: 9 }], [], { insertId: 77 }, {});
    await expect(allocateBed(conn, args)).resolves.toEqual({ allocationId: 77, bedId: 5, wardId: 2 });
    expect(conn.query.mock.calls[4][0]).toMatch(/UPDATE beds SET status = 'occupied'/);
    expect(conn.beginTransaction).not.toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
  });
});

describe('dischargeAllocation', () => {
  test('missing -> NotFoundError', async () => {
    await expect(dischargeAllocation(connWith([]), 1)).rejects.toBeInstanceOf(NotFoundError);
  });
  test('already discharged -> ConflictError', async () => {
    await expect(dischargeAllocation(connWith([{ id: 1, bed_id: 5, patient_id: 9, discharged_at: new Date() }]), 1)).rejects.toBeInstanceOf(ConflictError);
  });
  test('success frees the bed', async () => {
    const conn = connWith([{ id: 1, bed_id: 5, patient_id: 9, discharged_at: null }], {}, {});
    await expect(dischargeAllocation(conn, 1)).resolves.toEqual({ bedId: 5, patientId: 9 });
    expect(conn.query.mock.calls[2][0]).toMatch(/UPDATE beds SET status = 'available'/);
  });
});
