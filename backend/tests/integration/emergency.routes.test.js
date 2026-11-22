const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const { createUserSession, authed, cleanupUsers, closeTestConnections } = require('../helpers/session');

describe('emergency routes', () => {
  let admin, doctor, patient, wardId, bedId;
  const ids = [];
  const caseIds = [];
  const post = (url, s, body) => authed(request(app).post, url, s).send(body);
  const mk = async (body) => {
    const res = await post('/api/emergency/cases', admin, { chiefComplaint: 'Chest pain', ...body });
    if (res.body.data) caseIds.push(res.body.data.id);
    return res;
  };

  beforeAll(async () => {
    admin = await createUserSession('admin');
    doctor = await createUserSession('doctor');
    patient = await createUserSession('patient', { name: 'Erin Patient' });
    ids.push(admin.userId, doctor.userId, patient.userId);
    const [w] = await db.query('INSERT INTO wards (name, ward_type) VALUES (?, ?)', [`ER Test ${Date.now()}`, 'emergency']);
    wardId = w.insertId;
    const [b] = await db.query("INSERT INTO beds (ward_id, bed_number) VALUES (?, 'E-1')", [wardId]);
    bedId = b.insertId;
  });
  afterAll(async () => {
    await db.query('DELETE FROM emergency_cases WHERE id IN (?)', [caseIds.length ? caseIds : [0]]);
    await db.query('DELETE FROM bed_allocations WHERE bed_id = ?', [bedId]);
    await db.query('DELETE FROM wards WHERE id = ?', [wardId]);
    await cleanupUsers(ids);
  });

  test('patient role -> 403', async () => {
    expect((await authed(request(app).get, '/api/emergency/cases', patient)).status).toBe(403);
    expect((await post('/api/emergency/cases', patient, { patientName: 'x', chiefComplaint: 'y' })).status).toBe(403);
  });

  test('create: validation, suggested level, ESI<=2 alert to admin and doctor', async () => {
    expect((await post('/api/emergency/cases', admin, { chiefComplaint: 'x' })).status).toBe(400);
    const res = await mk({ patientName: 'Alert Person', requiresImmediateIntervention: true });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ triageLevel: 1, suggestedLevel: 1 });
    const [a] = await db.query("SELECT link FROM notifications WHERE user_id = ? AND type = 'emergency'", [admin.userId]);
    const [d] = await db.query("SELECT link FROM notifications WHERE user_id = ? AND type = 'emergency'", [doctor.userId]);
    expect(a.map((r) => r.link)).toContain('/admin/emergency');
    expect(d.map((r) => r.link)).toContain('/doctor/emergency');
  });

  test('clinician override and patient name default', async () => {
    const res = await mk({ patientId: patient.userId, expectedResources: 0, triageLevel: 3 });
    expect(res.body.data).toMatchObject({ triageLevel: 3, suggestedLevel: 5 });
    const got = await authed(request(app).get, `/api/emergency/cases/${res.body.data.id}`, doctor);
    expect(got.body.data.patient_name).toBe('Erin Patient');
    expect((await authed(request(app).get, '/api/emergency/cases/99999999', doctor)).status).toBe(404);
  });

  test('queue orders ESI 1 before an earlier ESI 3', async () => {
    const l3 = await mk({ patientName: 'Q3', triageLevel: 3 });
    const l1 = await mk({ patientName: 'Q1', triageLevel: 1 });
    const list = (await authed(request(app).get, '/api/emergency/cases', doctor)).body.data.map((r) => r.id);
    expect(list.indexOf(l1.body.data.id)).toBeLessThan(list.indexOf(l3.body.data.id));
    const row = (await authed(request(app).get, '/api/emergency/cases?status=all', doctor)).body.data[0];
    expect(row).toHaveProperty('wait_minutes');
    expect(row).toHaveProperty('assigned_doctor_name');
  });

  test('patch: invalid transition 409, admitted rejected 400, assign doctor + notify, discharge closes', async () => {
    const { body: { data: { id } } } = await mk({ patientName: 'Patch Me', triageLevel: 4 });
    const patch = (b) => authed(request(app).patch, `/api/emergency/cases/${id}`, admin).send(b);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ status: 'admitted' })).status).toBe(400);
    expect((await patch({ assignedDoctorId: 99999999 })).status).toBe(404);
    expect((await patch({ status: 'in_treatment', assignedDoctorId: doctor.doctorId, heartRate: 90 })).status).toBe(200);
    const [n] = await db.query("SELECT 1 FROM notifications WHERE user_id = ? AND title = 'Emergency case assigned'", [doctor.userId]);
    expect(n.length).toBe(1);
    expect((await patch({ status: 'discharged' })).status).toBe(200);
    expect((await patch({ status: 'in_treatment' })).status).toBe(409);
    // a closed case cannot be edited or reassigned
    expect((await patch({ triageLevel: 1 })).status).toBe(409);
    expect((await patch({ assignedDoctorId: doctor.doctorId, heartRate: 120 })).status).toBe(409);
    const [[row]] = await db.query('SELECT closed_at, heart_rate, triage_level FROM emergency_cases WHERE id = ?', [id]);
    expect(row.closed_at).not.toBeNull();
    expect(row.heart_rate).toBe(90);
    expect(row.triage_level).toBe(4);
  });

  test('admit without patient_id -> 400', async () => {
    const { body: { data: { id } } } = await mk({ patientName: 'Walk In' });
    expect((await post(`/api/emergency/cases/${id}/admit`, admin, { bedId })).status).toBe(400);
  });

  test('admit allocates the bed, then a second admit is 409; stats reflect it', async () => {
    const { body: { data: { id } } } = await mk({ patientId: patient.userId, triageLevel: 2 });
    const res = await post(`/api/emergency/cases/${id}/admit`, doctor, { bedId });
    expect(res.status).toBe(200);
    const [[bed]] = await db.query('SELECT status FROM beds WHERE id = ?', [bedId]);
    expect(bed.status).toBe('occupied');
    const [[c]] = await db.query('SELECT status, bed_allocation_id, closed_at FROM emergency_cases WHERE id = ?', [id]);
    expect(c).toMatchObject({ status: 'admitted', bed_allocation_id: res.body.data.allocationId });
    expect(c.closed_at).not.toBeNull();
    expect((await post(`/api/emergency/cases/${id}/admit`, admin, { bedId })).status).toBe(409);

    const s = (await authed(request(app).get, '/api/emergency/stats', admin)).body.data;
    expect(s.admittedToday).toBeGreaterThanOrEqual(1);
    expect(s.active).toBe(s.waiting + s.inTreatment);
    expect(Object.keys(s.byTriageLevel)).toEqual(['1', '2', '3', '4', '5']);
    expect(Number.isInteger(s.avgWaitMinutes)).toBe(true);
  });
});

afterAll(closeTestConnections);
