const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const { createUserSession, authed, cleanupUsers, closeTestConnections } = require('../helpers/session');
const { addDays } = require('../../utils/bloodCompatibility');
const { toDateStr } = require('../../utils/dates');

const today = toDateStr(new Date());
const ago = (n) => addDays(today, -n);

describe('blood bank routes', () => {
  let admin, doctor, otherDoctor, patient;
  const ids = [];
  const donorIds = [];

  beforeAll(async () => {
    admin = await createUserSession('admin');
    doctor = await createUserSession('doctor');
    otherDoctor = await createUserSession('doctor');
    patient = await createUserSession('patient');
    ids.push(admin.userId, doctor.userId, otherDoctor.userId, patient.userId);
  });
  afterAll(async () => {
    await db.query('DELETE FROM blood_units WHERE donor_id IN (?)', [donorIds.length ? donorIds : [0]]);
    await db.query('DELETE FROM blood_donors WHERE id IN (?)', [donorIds.length ? donorIds : [0]]);
    await cleanupUsers(ids); // cascades blood_requests via patient_id
  });

  const post = (url, s, body) => authed(request(app).post, url, s).send(body);
  const patch = (url, s, body = {}) => authed(request(app).patch, url, s).send(body);
  const newDonor = async (bloodGroup) => {
    const r = await post('/api/blood/donors', admin, { name: `Donor ${bloodGroup}`, bloodGroup, phone: '5551234567' });
    donorIds.push(r.body.data.id);
    return r.body.data.id;
  };
  const donate = (donorId, component, collectedOn) => post('/api/blood/donations', admin, { donorId, component, volumeMl: 450, collectedOn });
  const newRequest = (bloodGroup, component, unitsRequested, by = doctor, urgency = 'routine') =>
    post('/api/blood/requests', by, { patientId: patient.userId, bloodGroup, component, unitsRequested, urgency });
  const inv = async (g, c) => {
    const res = await authed(request(app).get, '/api/blood/inventory', admin);
    return res.body.data.find((r) => r.blood_group === g && r.component === c);
  };

  test('role checks: patient 403, doctor cannot manage donors or fulfill, unauthenticated 401', async () => {
    expect((await authed(request(app).get, '/api/blood/inventory', patient)).status).toBe(403);
    expect((await request(app).get('/api/blood/inventory')).status).toBe(401);
    expect((await authed(request(app).get, '/api/blood/donors', doctor)).status).toBe(403);
    expect((await post('/api/blood/donors', doctor, { name: 'x', bloodGroup: 'A+', phone: '12345' })).status).toBe(403);
    expect((await authed(request(app).get, '/api/blood/inventory', doctor)).status).toBe(200);
  });

  test('donor -> donations -> inventory -> request -> fulfill (exact group, FEFO) -> second fulfill 409', async () => {
    const [dA1, dA2, dAn, dO] = await Promise.all(['A+', 'A+', 'A-', 'O-'].map(newDonor));
    const u1 = (await donate(dA1, 'packed_rbc', ago(10))).body.data; // exp today+32
    const u2 = (await donate(dA2, 'packed_rbc', ago(3))).body.data; // exp today+39
    const u3 = (await donate(dAn, 'packed_rbc', ago(20))).body.data; // exp earlier but not exact
    await donate(dO, 'packed_rbc', ago(1));
    expect(u1.expiresOn).toBe(addDays(ago(10), 42));

    const all = (await authed(request(app).get, '/api/blood/inventory', admin)).body.data;
    expect(all).toHaveLength(32);
    expect(await inv('A+', 'packed_rbc')).toEqual({ blood_group: 'A+', component: 'packed_rbc', available: 2, expiring_soon: 0 });
    expect(await inv('B+', 'plasma')).toMatchObject({ available: 0, expiring_soon: 0 });

    const r = await newRequest('A+', 'packed_rbc', 2);
    expect(r.status).toBe(201);
    const reqId = r.body.data.id;

    const listed = (await authed(request(app).get, '/api/blood/requests?status=pending', doctor)).body.data;
    expect(listed.map((x) => x.id)).toEqual([reqId]);
    expect(listed[0]).toMatchObject({ patient_name: 'Test patient', requester_name: 'Test doctor' });
    expect((await authed(request(app).get, '/api/blood/requests', otherDoctor)).body.data).toEqual([]);

    expect((await post(`/api/blood/requests/${reqId}/fulfill`, doctor, {})).status).toBe(403);
    const f = await post(`/api/blood/requests/${reqId}/fulfill`, admin, {});
    expect(f.status).toBe(200);
    expect([...f.body.data.issuedUnitIds].sort()).toEqual([u1.unitId, u2.unitId].sort()); // exact group beats the earlier-expiring A-
    expect(f.body.data.issuedUnitIds).not.toContain(u3.unitId);

    expect((await post(`/api/blood/requests/${reqId}/fulfill`, admin, {})).status).toBe(409);
    expect((await patch(`/api/blood/requests/${reqId}/cancel`, admin)).status).toBe(409);
    expect((await patch(`/api/blood/units/${u1.unitId}/discard`, admin)).status).toBe(409); // issued

    const [[n]] = await db.query(
      "SELECT COUNT(*) AS c FROM notifications WHERE type = 'blood' AND user_id IN (?, ?)", [doctor.userId, patient.userId]);
    expect(n.c).toBe(2);
    const [[low]] = await db.query("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'blood' AND title = 'Low blood stock'", [admin.userId]);
    expect(low.c).toBe(1);

    // Falls back to compatible O-/A- with FEFO once exact stock is gone; insufficient -> 409.
    const r2 = (await newRequest('A+', 'packed_rbc', 3)).body.data.id;
    expect((await post(`/api/blood/requests/${r2}/fulfill`, admin, {})).status).toBe(409);
    const r3 = (await newRequest('A+', 'packed_rbc', 2)).body.data.id;
    const f3 = await post(`/api/blood/requests/${r3}/fulfill`, admin, {});
    expect(f3.body.data.issuedUnitIds).toEqual([u3.unitId, expect.any(Number)]); // oldest first
  });

  test('56-day donor rule -> 409, future date and bad volume -> 400', async () => {
    const d = await newDonor('B+');
    expect((await donate(d, 'whole_blood', ago(60))).status).toBe(201);
    expect((await donate(d, 'plasma', ago(10))).status).toBe(409);
    const [[row]] = await db.query('SELECT last_donation_date FROM blood_donors WHERE id = ?', [d]);
    expect(toDateStr(row.last_donation_date)).toBe(ago(60));
    expect((await donate(d, 'plasma', addDays(today, 2))).status).toBe(400);
    expect((await donate(d, 'plasma', '2026-02-31')).status).toBe(400); // impossible date
    const leap = await newDonor('O+');
    expect((await donate(leap, 'plasma', '2024-02-29')).status).toBe(201);
    expect((await post('/api/blood/donations', admin, { donorId: d, component: 'plasma', volumeMl: 50 })).status).toBe(400);
    expect((await donate(999999999, 'plasma')).status).toBe(404);
  });

  test('expired units are swept by inventory and cannot be issued; discard works once', async () => {
    const d = await newDonor('AB+');
    const unit = (await donate(d, 'platelets', ago(10))).body.data; // expired 5 days ago
    expect((await inv('AB+', 'platelets')).available).toBe(0);
    const [[u]] = await db.query('SELECT status FROM blood_units WHERE id = ?', [unit.unitId]);
    expect(u.status).toBe('expired');
    expect((await patch(`/api/blood/units/${unit.unitId}/discard`, admin)).status).toBe(409);

    const d2 = await newDonor('AB-');
    const fresh = (await donate(d2, 'platelets', ago(4))).body.data; // expires tomorrow
    expect((await inv('AB-', 'platelets')).expiring_soon).toBe(1);
    expect((await patch(`/api/blood/units/${fresh.unitId}/discard`, admin)).status).toBe(200);
    expect((await patch(`/api/blood/units/${fresh.unitId}/discard`, admin)).status).toBe(409);
    const units = (await authed(request(app).get, '/api/blood/units?bloodGroup=AB-&component=platelets&status=discarded', admin)).body.data;
    expect(units.map((x) => x.id)).toEqual([fresh.unitId]);
  });

  test('request validation, ownership, cancel and reject, emergency alert', async () => {
    expect((await post('/api/blood/requests', doctor, { patientId: admin.userId, bloodGroup: 'A+', component: 'plasma', unitsRequested: 1 })).status).toBe(404);
    expect((await newRequest('A+', 'plasma', 11)).status).toBe(400);

    const mine = (await newRequest('B-', 'plasma', 1)).body.data.id;
    expect((await patch(`/api/blood/requests/${mine}/cancel`, otherDoctor)).status).toBe(403);
    expect((await patch(`/api/blood/requests/${mine}/cancel`, doctor)).status).toBe(200);
    expect((await patch(`/api/blood/requests/${mine}/cancel`, doctor)).status).toBe(409);

    const rej = (await newRequest('B-', 'plasma', 1)).body.data.id;
    expect((await patch(`/api/blood/requests/${rej}/reject`, doctor, {})).status).toBe(403);
    expect((await patch(`/api/blood/requests/${rej}/reject`, admin, { notes: 'no stock' })).status).toBe(200);
    expect((await post(`/api/blood/requests/${rej}/fulfill`, admin, {})).status).toBe(409);

    await newRequest('B-', 'plasma', 1, doctor, 'emergency');
    const [[e]] = await db.query("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND title = 'Emergency blood request'", [admin.userId]);
    expect(e.c).toBe(1);
  });

  test('concurrent fulfills competing for the same stock: exactly one wins, one 409, no 500', async () => {
    const [d1, d2] = await Promise.all([newDonor('AB-'), newDonor('A-')]);
    await donate(d1, 'plasma', ago(2));
    await donate(d2, 'plasma', ago(1));
    // AB- plasma recipients accept only AB donors, so only the AB- unit matches (the A- unit is not eligible).
    const a = (await newRequest('AB-', 'plasma', 1)).body.data.id;
    const b = (await newRequest('AB-', 'plasma', 1)).body.data.id;
    const results = await Promise.all([a, b].map((id) => post(`/api/blood/requests/${id}/fulfill`, admin, {})));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

afterAll(closeTestConnections);
