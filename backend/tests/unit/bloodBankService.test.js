const { fulfillRequest, recordDonation, discardUnit, closeRequest } = require('../../services/bloodBankService');
const { NotFoundError, ConflictError, ForbiddenError, ValidationError } = require('../../utils/errors');

const connWith = (...results) => {
  const query = jest.fn();
  results.forEach((r) => query.mockResolvedValueOnce([r]));
  return { query };
};
const pending = { id: 1, status: 'pending', blood_group: 'A+', component: 'packed_rbc', units_requested: 2, requested_by: 7, patient_id: 9 };

describe('fulfillRequest', () => {
  test('missing / non-pending request', async () => {
    await expect(fulfillRequest(connWith([]), 1)).rejects.toBeInstanceOf(NotFoundError);
    await expect(fulfillRequest(connWith([{ ...pending, status: 'fulfilled' }]), 1)).rejects.toBeInstanceOf(ConflictError);
  });
  test('insufficient compatible stock -> 409 and nothing updated', async () => {
    const conn = connWith([pending], [{ id: 5, blood_group: 'A+' }]);
    await expect(fulfillRequest(conn, 1)).rejects.toThrow('Insufficient compatible stock');
    expect(conn.query).toHaveBeenCalledTimes(2);
  });
  test('locks request first, then units exact-group-first FEFO, compatible groups only', async () => {
    const conn = connWith([pending], [{ id: 5, blood_group: 'A+' }, { id: 6, blood_group: 'O-' }], { affectedRows: 2 }, { affectedRows: 1 });
    const out = await fulfillRequest(conn, 1);
    expect(out.issuedUnitIds).toEqual([5, 6]);
    expect(out.issuedGroups).toEqual(['A+', 'O-']);
    const [reqSql] = conn.query.mock.calls[0];
    const [unitSql, unitParams] = conn.query.mock.calls[1];
    expect(reqSql).toMatch(/FROM blood_requests .*FOR UPDATE/);
    expect(unitSql).toMatch(/ORDER BY \(blood_group = \?\) DESC, expires_on ASC/);
    expect(unitSql).toMatch(/expires_on >= CURDATE\(\)/);
    expect(unitSql).toMatch(/FOR UPDATE/);
    expect(unitParams).toEqual(['packed_rbc', ['A+', 'A-', 'O+', 'O-'], 'A+', 2]);
  });
  test('guard failing on the unit update -> 409', async () => {
    const conn = connWith([pending], [{ id: 5, blood_group: 'A+' }, { id: 6, blood_group: 'A+' }], { affectedRows: 1 });
    await expect(fulfillRequest(conn, 1)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('recordDonation', () => {
  test('unknown donor -> 404, future date -> 400', async () => {
    await expect(recordDonation(connWith([]), { donorId: 1, component: 'plasma', volumeMl: 200, collectedOn: '2020-01-01' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(recordDonation(connWith(), { donorId: 1, component: 'plasma', volumeMl: 200, collectedOn: '2999-01-01' })).rejects.toBeInstanceOf(ValidationError);
  });
  test('56-day rule boundary', async () => {
    const donor = (d) => [{ id: 1, blood_group: 'O+', last_donation_date: d }];
    const args = { donorId: 1, component: 'whole_blood', volumeMl: 450, collectedOn: '2026-03-02' };
    await expect(recordDonation(connWith(donor('2026-01-07')), args)).rejects.toBeInstanceOf(ConflictError); // 54 days
    const ok = connWith(donor('2026-01-05'), { insertId: 3 }, {}); // exactly 56 days
    await expect(recordDonation(ok, args)).resolves.toEqual({ unitId: 3, expiresOn: '2026-04-06' });
  });
});

describe('discardUnit / closeRequest', () => {
  test('only available units can be discarded', async () => {
    await expect(discardUnit(connWith([{ status: 'issued' }]), 1)).rejects.toBeInstanceOf(ConflictError);
    await expect(discardUnit(connWith([]), 1)).rejects.toBeInstanceOf(NotFoundError);
  });
  test('cancel: other doctor forbidden, requester ok, non-pending 409', async () => {
    await expect(closeRequest(connWith([pending]), 1, { status: 'cancelled', user: { id: 8, role: 'doctor' } })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(closeRequest(connWith([pending], {}), 1, { status: 'cancelled', user: { id: 7, role: 'doctor' } })).resolves.toBeDefined();
    await expect(closeRequest(connWith([{ ...pending, status: 'rejected' }]), 1, { status: 'cancelled', user: { id: 1, role: 'admin' } })).rejects.toBeInstanceOf(ConflictError);
  });
});
