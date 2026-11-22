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
  test('locks bed, then patient user row (FOR UPDATE), then plain-reads open allocations', async () => {
    const conn = connWith([{ id: 5, ward_id: 2, status: 'available' }], [{ id: 9 }], [{ id: 1 }]);
    await allocateBed(conn, args).catch(() => {});
    expect(conn.query.mock.calls[0][0]).toMatch(/FROM beds .*FOR UPDATE/);
    expect(conn.query.mock.calls[1][0]).toMatch(/FROM users .*FOR UPDATE/);
    expect(conn.query.mock.calls[2][0]).not.toMatch(/FOR UPDATE/);
  });
  test('bed flip guard failing -> ConflictError', async () => {
    const conn = connWith([{ id: 5, ward_id: 2, status: 'available' }], [{ id: 9 }], [], [], { insertId: 77 }, { affectedRows: 0 });
    await expect(allocateBed(conn, args)).rejects.toBeInstanceOf(ConflictError);
  });
  test('success inserts, occupies the bed, and never manages the transaction', async () => {
    const conn = connWith([{ id: 5, ward_id: 2, status: 'available' }], [{ id: 9 }], [], [], { insertId: 77 }, { affectedRows: 1 });
    await expect(allocateBed(conn, args)).resolves.toEqual({ allocationId: 77, bedId: 5, wardId: 2, request: null, attendingDoctorId: null });
    expect(conn.query.mock.calls[3][0]).toMatch(/FROM bed_requests WHERE open_key = \?/);
    expect(conn.query.mock.calls[3][1]).toEqual(['admission:9']);
    expect(conn.query.mock.calls[4][1]).toEqual([5, 9, 1, null, 'obs', 9, 5]); // no attending doctor; open_patient_id, open_bed_id set
    expect(conn.query.mock.calls[5][0]).toMatch(/UPDATE beds SET status = 'occupied' WHERE id = \? AND status = 'available'/);
    expect(conn.query).toHaveBeenCalledTimes(6); // no request to resolve
    expect(conn.beginTransaction).not.toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).not.toHaveBeenCalled();
  });
  test("a doctor's pending bed request: its doctor attends, its reason is kept, and it is marked fulfilled", async () => {
    const conn = connWith([{ id: 5, ward_id: 2, status: 'available' }], [{ id: 9 }], [], [{ id: 40, requested_by: 3, reason: 'from doctor' }],
      { insertId: 77 }, { affectedRows: 1 }, { affectedRows: 1 });
    const res = await allocateBed(conn, { bedId: 5, patientId: 9, allocatedBy: 1 });
    expect(res.request).toEqual({ id: 40, requested_by: 3, reason: 'from doctor' });
    expect(conn.query.mock.calls[4][1]).toEqual([5, 9, 1, 3, 'from doctor', 9, 5]);
    expect(conn.query.mock.calls[6][0]).toMatch(/UPDATE bed_requests SET status = 'fulfilled', open_key = NULL/);
    expect(conn.query.mock.calls[6][1]).toEqual([1, 77, 40]);
  });
  test('DB unique key hit on insert -> ConflictError naming the bed or the patient', async () => {
    const dup = (key) => Object.assign(new Error(`Duplicate entry '5' for key '${key}'`), { code: 'ER_DUP_ENTRY' });
    const base = () => connWith([{ id: 5, ward_id: 2, status: 'available' }], [{ id: 9 }], [], []);
    const c1 = base(); c1.query.mockRejectedValueOnce(dup('uq_alloc_open_bed'));
    await expect(allocateBed(c1, args)).rejects.toThrow('Bed is not available');
    const c2 = base(); c2.query.mockRejectedValueOnce(dup('uq_alloc_open_patient'));
    await expect(allocateBed(c2, args)).rejects.toThrow('Patient already admitted');
    const c3 = base(); c3.query.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'ER_OTHER' }));
    await expect(allocateBed(c3, args)).rejects.toThrow('boom');
  });
});

describe('dischargeAllocation', () => {
  const alloc = { patient_id: 9, discharged_at: null };
  test('missing -> NotFoundError', async () => {
    await expect(dischargeAllocation(connWith([]), 1)).rejects.toBeInstanceOf(NotFoundError);
  });
  test('already discharged -> ConflictError', async () => {
    const conn = connWith([{ bed_id: 5 }], [{ status: 'available' }], [{ ...alloc, discharged_at: new Date() }]);
    await expect(dischargeAllocation(conn, 1)).rejects.toThrow('already discharged');
  });
  test('bed not occupied -> ConflictError, bed not overwritten', async () => {
    const conn = connWith([{ bed_id: 5 }], [{ status: 'maintenance' }], [alloc]);
    await expect(dischargeAllocation(conn, 1)).rejects.toThrow('not in occupied state');
    expect(conn.query).toHaveBeenCalledTimes(3);
  });
  test('success locks bed before allocation, then frees the bed', async () => {
    const conn = connWith([{ bed_id: 5 }], [{ status: 'occupied' }], [alloc], {}, {}, []);
    await expect(dischargeAllocation(conn, 1)).resolves.toEqual({ bedId: 5, patientId: 9, request: null });
    const sql = conn.query.mock.calls.map((c) => c[0]);
    expect(sql[0]).not.toMatch(/FOR UPDATE/);
    expect(sql[1]).toMatch(/FROM beds .*FOR UPDATE/);
    expect(sql[2]).toMatch(/FROM bed_allocations .*bed_id = \? FOR UPDATE/);
    expect(sql[3]).toMatch(/discharged_at = NOW\(\), open_patient_id = NULL, open_bed_id = NULL/);
    expect(sql[4]).toMatch(/UPDATE beds SET status = 'available'/);
    expect(sql[5]).toMatch(/FROM bed_requests WHERE open_key = \?/);
    expect(conn.query.mock.calls[5][1]).toEqual(['discharge:1']);
  });
  test("a pending discharge request for the admission is marked fulfilled", async () => {
    const conn = connWith([{ bed_id: 5 }], [{ status: 'occupied' }], [alloc], {}, {}, [{ id: 41, requested_by: 3 }], { affectedRows: 1 });
    const res = await dischargeAllocation(conn, 1, 2);
    expect(res.request).toEqual({ id: 41, requested_by: 3 });
    expect(conn.query.mock.calls[6][1]).toEqual([2, null, 41]);
  });
});
