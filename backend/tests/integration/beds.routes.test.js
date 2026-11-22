const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const { createUserSession, authed, cleanupUsers, closeTestConnections } = require('../helpers/session');

describe('beds routes', () => {
  let admin, doctor, p1, p2, p3, wardId, bedA, bedB, bedC, bedD;
  const ids = [];

  beforeAll(async () => {
    admin = await createUserSession('admin');
    doctor = await createUserSession('doctor');
    p1 = await createUserSession('patient', { name: 'Zed Bedpatient' });
    p2 = await createUserSession('patient');
    p3 = await createUserSession('patient');
    ids.push(admin.userId, doctor.userId, p1.userId, p2.userId, p3.userId);
    const res = await authed(request(app).post, '/api/beds/wards', admin)
      .send({ name: `Test Ward ${Date.now()}`, wardType: 'private', floor: 3 });
    wardId = res.body.data.id;
    const mk = async (n) => (await authed(request(app).post, '/api/beds', admin).send({ wardId, bedNumber: n, dailyRate: 100 })).body.data.id;
    bedA = await mk('T-1');
    bedB = await mk('T-2');
    bedC = await mk('T-3');
    bedD = await mk('T-4');
  });
  afterAll(async () => {
    await db.query('DELETE FROM bed_allocations WHERE bed_id IN (?)', [[bedA, bedB, bedC, bedD]]);
    await db.query('DELETE FROM wards WHERE id = ?', [wardId]); // cascades beds
    await cleanupUsers(ids);
  });

  const allocate = (bed, patient, by = admin) => authed(request(app).post, `/api/beds/${bed}/allocate`, by).send({ patientId: patient.userId });

  test('patient role -> 403, unauthenticated -> 401', async () => {
    expect((await authed(request(app).get, '/api/beds/stats', p1)).status).toBe(403);
    expect((await allocate(bedA, p1, p1)).status).toBe(403);
    expect((await request(app).get('/api/beds')).status).toBe(401);
  });

  test('doctor cannot create wards or change status', async () => {
    expect((await authed(request(app).post, '/api/beds/wards', doctor).send({ name: 'x', wardType: 'icu' })).status).toBe(403);
    expect((await authed(request(app).patch, `/api/beds/${bedA}/status`, doctor).send({ status: 'maintenance' })).status).toBe(403);
  });

  test('duplicate ward name -> 409; occupied status rejected by validator', async () => {
    const [[w]] = await db.query('SELECT name FROM wards WHERE id = ?', [wardId]);
    expect((await authed(request(app).post, '/api/beds/wards', admin).send({ name: w.name, wardType: 'icu' })).status).toBe(409);
    expect((await authed(request(app).patch, `/api/beds/${bedA}/status`, admin).send({ status: 'occupied' })).status).toBe(400);
  });

  test('allocate -> double allocate 409 -> already admitted 409 -> occupied status 409 -> discharge -> re-allocate', async () => {
    const r1 = await allocate(bedA, p1, doctor);
    expect(r1.status).toBe(201);
    const allocationId = r1.body.data.allocationId;

    const [[n]] = await db.query("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'bed'", [p1.userId]);
    expect(n.c).toBe(1);

    expect((await allocate(bedA, p2)).status).toBe(409); // bed taken
    expect((await allocate(bedB, p1)).status).toBe(409); // patient already admitted
    expect((await authed(request(app).patch, `/api/beds/${bedA}/status`, admin).send({ status: 'maintenance' })).status).toBe(409);

    const list = await authed(request(app).get, `/api/beds?wardId=${wardId}`, admin);
    const row = list.body.data.find((b) => b.id === bedA);
    expect(row).toMatchObject({ status: 'occupied', allocation_id: allocationId, patient_id: p1.userId, patient_name: 'Zed Bedpatient' });
    expect(list.body.data.find((b) => b.id === bedB).allocation_id).toBeNull();

    const wards = await authed(request(app).get, '/api/beds/wards', admin);
    expect(wards.body.data.find((w) => w.id === wardId)).toMatchObject({ total: 4, available: 3, occupied: 1 });

    const stats = await authed(request(app).get, '/api/beds/stats', doctor);
    expect(stats.body.data.occupied).toBeGreaterThanOrEqual(1);
    expect(stats.body.data.occupancyRate).toBeGreaterThan(0);

    expect((await authed(request(app).post, `/api/beds/allocations/${allocationId}/discharge`, doctor)).status).toBe(200);
    expect((await authed(request(app).post, `/api/beds/allocations/${allocationId}/discharge`, doctor)).status).toBe(409);
    expect((await allocate(bedA, p1)).status).toBe(201);
  });

  test('concurrent allocations of one patient to two beds: one 201, one 409, no 500', async () => {
    const [x, y] = await Promise.all([allocate(bedC, p3), allocate(bedD, p3)]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
  });

  test('DB unique keys reject a second open allocation even when the app check is bypassed', async () => {
    const [[open]] = await db.query('SELECT bed_id, open_patient_id, open_bed_id FROM bed_allocations WHERE patient_id = ? AND discharged_at IS NULL', [p3.userId]);
    expect(open).toMatchObject({ open_patient_id: p3.userId, open_bed_id: open.bed_id });
    const other = open.bed_id === bedC ? bedD : bedC;
    const raw = (bed, patient) => db.query(
      'INSERT INTO bed_allocations (bed_id, patient_id, open_patient_id, open_bed_id) VALUES (?, ?, ?, ?)', [bed, patient, patient, bed]
    );
    await expect(raw(other, p3.userId)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' }); // same patient, free bed
    await expect(raw(open.bed_id, p2.userId)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' }); // same bed, new patient
    const [[closed]] = await db.query('SELECT COUNT(*) AS c FROM bed_allocations WHERE discharged_at IS NOT NULL AND (open_patient_id IS NOT NULL OR open_bed_id IS NOT NULL)');
    expect(closed.c).toBe(0); // discharge clears the keys
  });

  test('status change on free bed works; unknown bed -> 404', async () => {
    expect((await authed(request(app).patch, `/api/beds/${bedB}/status`, admin).send({ status: 'maintenance' })).status).toBe(200);
    expect((await allocate(bedB, p2)).status).toBe(409);
    expect((await authed(request(app).patch, '/api/beds/999999/status', admin).send({ status: 'available' })).status).toBe(404);
  });

  test('patient search: patients only, q min 2 chars', async () => {
    const ok = await authed(request(app).get, '/api/beds/patients/search?q=Bedpat', doctor);
    expect(ok.status).toBe(200);
    expect(ok.body.data.map((p) => p.id)).toEqual([p1.userId]);
    expect(Object.keys(ok.body.data[0]).sort()).toEqual(['email', 'id', 'name', 'phone']);
    expect((await authed(request(app).get, '/api/beds/patients/search?q=a', doctor)).status).toBe(400);
  });

  test('admin cannot delete a patient with an open bed allocation (409), other patients delete fine', async () => {
    const res = await authed(request(app).delete, `/api/admin/user/${p1.userId}`, admin);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Discharge the patient from their bed first.');
    const [[u]] = await db.query('SELECT COUNT(*) AS c FROM users WHERE id = ?', [p1.userId]);
    expect(u.c).toBe(1);
    expect((await authed(request(app).delete, `/api/admin/user/${p2.userId}`, admin)).status).toBe(200);
  });
});

afterAll(closeTestConnections);
