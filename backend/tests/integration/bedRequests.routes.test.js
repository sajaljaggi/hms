const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const { createUserSession, authed, cleanupUsers, closeTestConnections } = require('../helpers/session');

describe('bed requests: doctors ask, the admin assigns and discharges', () => {
  let admin, doctor, otherDoctor, wardId, bedA, bedB, bedC;
  const ids = [];
  const fresh = async (role = 'patient', o) => { const s = await createUserSession(role, o); ids.push(s.userId); return s; };
  const ask = (who, body) => authed(request(app).post, '/api/beds/requests', who).send(body);
  const list = async (who) => (await authed(request(app).get, '/api/beds/requests', who)).body.data;
  const fulfill = (id, body = {}) => authed(request(app).post, `/api/beds/requests/${id}/fulfill`, admin).send(body);
  const myPatients = async (who) => (await authed(request(app).get, '/api/beds/my-patients', who)).body.data;
  const notes = async (userId, title) =>
    (await db.query('SELECT message FROM notifications WHERE user_id = ? AND title = ?', [userId, title]))[0].map((n) => n.message);

  beforeAll(async () => {
    admin = await fresh('admin');
    doctor = await fresh('doctor');
    otherDoctor = await fresh('doctor');
    const w = await authed(request(app).post, '/api/beds/wards', admin).send({ name: `Req Ward ${Date.now()}`, wardType: 'general' });
    wardId = w.body.data.id;
    const mk = async (n) => (await authed(request(app).post, '/api/beds', admin).send({ wardId, bedNumber: n })).body.data.id;
    [bedA, bedB, bedC] = [await mk('R-1'), await mk('R-2'), await mk('R-3')];
  });
  afterAll(async () => {
    await db.query('DELETE FROM bed_requests WHERE requested_by IN (?)', [[doctor.userId, otherDoctor.userId]]);
    await db.query('DELETE FROM bed_allocations WHERE bed_id IN (?)', [[bedA, bedB, bedC]]);
    await db.query('DELETE FROM wards WHERE id = ?', [wardId]);
    await cleanupUsers(ids);
  });

  test('admission request -> admin assigns a bed -> the doctor sees the bed and requests discharge -> admin discharges', async () => {
    const p = await fresh('patient', { name: 'Ravi Ward' });
    const res = await ask(doctor, { type: 'admission', patientId: p.userId, wardType: 'general', urgency: 'urgent', reason: 'Observation' });
    expect(res.status).toBe(201);
    const reqId = res.body.data.id;
    expect(await notes(admin.userId, 'Bed request')).toContain('Bed request for Ravi Ward (urgent).');
    expect((await ask(doctor, { type: 'admission', patientId: p.userId })).status).toBe(409); // one pending at a time

    // Each doctor sees only their own requests; the admin sees all.
    expect((await list(doctor)).map((r) => r.id)).toContain(reqId);
    expect((await list(otherDoctor)).map((r) => r.id)).not.toContain(reqId);
    expect((await list(admin)).find((r) => r.id === reqId)).toMatchObject({ status: 'pending', request_type: 'admission', patient_name: 'Ravi Ward' });

    expect((await fulfill(reqId)).status).toBe(400); // admission needs a bed
    expect((await fulfill(reqId, { bedId: bedA })).status).toBe(200);
    expect((await fulfill(reqId, { bedId: bedB })).status).toBe(409);

    const [[a]] = await db.query('SELECT id, attending_doctor_id FROM bed_allocations WHERE patient_id = ? AND discharged_at IS NULL', [p.userId]);
    expect(a.attending_doctor_id).toBe(doctor.userId);
    expect((await list(doctor)).find((r) => r.id === reqId)).toMatchObject({ status: 'fulfilled', allocation_id: a.id, bed_number: 'R-1' });
    expect((await notes(doctor.userId, 'Bed assigned'))[0]).toMatch(/Ravi Ward was assigned bed .* \/ R-1/);

    const mine = await myPatients(doctor);
    expect(mine).toEqual([expect.objectContaining({ allocation_id: a.id, patient_name: 'Ravi Ward', bed_number: 'R-1', discharge_request_id: null })]);
    expect(await myPatients(otherDoctor)).toEqual([]);
    expect((await ask(doctor, { type: 'admission', patientId: p.userId })).status).toBe(409); // already admitted

    // Discharge: only the attending doctor may ask, once.
    expect((await ask(otherDoctor, { type: 'discharge', allocationId: a.id })).status).toBe(404);
    const d = await ask(doctor, { type: 'discharge', allocationId: a.id, reason: 'Recovered' });
    expect(d.status).toBe(201);
    expect((await ask(doctor, { type: 'discharge', allocationId: a.id })).status).toBe(409);
    expect((await myPatients(doctor))[0].discharge_request_id).toBe(d.body.data.id);

    expect((await fulfill(d.body.data.id)).status).toBe(200);
    const [[bed]] = await db.query('SELECT status FROM beds WHERE id = ?', [bedA]);
    expect(bed.status).toBe('available');
    expect(await myPatients(doctor)).toEqual([]);
    expect(await notes(p.userId, 'Discharged')).toHaveLength(1);
  });

  test('reject notifies the doctor with the reason; only the requester (or admin) can cancel', async () => {
    const p = await fresh();
    const r1 = (await ask(doctor, { type: 'admission', patientId: p.userId })).body.data.id;
    const rej = await authed(request(app).patch, `/api/beds/requests/${r1}/reject`, admin).send({ notes: 'No ICU bed free' });
    expect(rej.status).toBe(200);
    expect((await notes(doctor.userId, 'Bed request rejected')).some((m) => m.endsWith('No ICU bed free'))).toBe(true);
    expect((await authed(request(app).patch, `/api/beds/requests/${r1}/reject`, doctor).send({})).status).toBe(403);

    const r2 = (await ask(doctor, { type: 'admission', patientId: p.userId })).body.data.id; // allowed again after rejection
    expect((await authed(request(app).patch, `/api/beds/requests/${r2}/cancel`, otherDoctor)).status).toBe(404);
    expect((await authed(request(app).patch, `/api/beds/requests/${r2}/cancel`, doctor)).status).toBe(200);
    expect((await authed(request(app).patch, `/api/beds/requests/${r2}/cancel`, doctor)).status).toBe(409);
    expect((await ask(p, { type: 'admission', patientId: p.userId })).status).toBe(403); // patients cannot ask
  });

  test('a failed assignment changes nothing; a direct admin assignment still answers the request', async () => {
    const [p1, p2] = [await fresh(), await fresh()];
    await authed(request(app).post, `/api/beds/${bedB}/allocate`, admin).send({ patientId: p1.userId });
    const r = (await ask(doctor, { type: 'admission', patientId: p2.userId })).body.data.id;
    expect((await fulfill(r, { bedId: bedB })).status).toBe(409); // bed taken
    expect((await list(admin)).find((x) => x.id === r).status).toBe('pending');

    // The admin uses the bed grid instead: the request is answered and the doctor still attends.
    expect((await authed(request(app).post, `/api/beds/${bedC}/allocate`, admin).send({ patientId: p2.userId })).status).toBe(201);
    expect((await list(admin)).find((x) => x.id === r).status).toBe('fulfilled');
    expect((await myPatients(doctor)).map((m) => m.patient_id)).toContain(p2.userId);
  });

  test('emergency: the doctor requests a bed for a case; the admin assigns it and the case is admitted', async () => {
    const p = await fresh();
    const mkCase = async (body) => (await authed(request(app).post, '/api/emergency/cases', doctor)
      .send({ patientName: 'ER Case', chiefComplaint: 'Chest pain', triageLevel: 1, ...body })).body.data.id;
    const reqBed = (caseId) => authed(request(app).post, `/api/emergency/cases/${caseId}/request-bed`, doctor).send({ wardType: 'icu' });

    expect((await reqBed(await mkCase({}))).status).toBe(400); // patient not registered on the case
    const caseId = await mkCase({ patientId: p.userId });
    expect((await authed(request(app).post, `/api/emergency/cases/${caseId}/admit`, doctor).send({ bedId: bedA })).status).toBe(403);
    expect((await reqBed(caseId)).status).toBe(201);
    expect(await notes(admin.userId, 'Emergency bed request')).not.toHaveLength(0);

    const c = (await authed(request(app).get, `/api/emergency/cases/${caseId}`, doctor)).body.data;
    const r = (await list(admin)).find((x) => x.id === c.bed_request_id);
    expect(r).toMatchObject({ urgency: 'emergency', ward_type: 'icu', emergency_case_id: caseId });
    expect((await fulfill(r.id, { bedId: bedA })).status).toBe(200);
    const [[ec]] = await db.query('SELECT status, bed_allocation_id FROM emergency_cases WHERE id = ?', [caseId]);
    expect(ec.status).toBe('admitted');
    expect(ec.bed_allocation_id).not.toBeNull();

    // Closing a case cancels its pending bed request.
    const p2 = await fresh();
    const case2 = await mkCase({ patientId: p2.userId });
    await reqBed(case2);
    const patch = (b) => authed(request(app).patch, `/api/emergency/cases/${case2}`, doctor).send(b);
    expect((await patch({ status: 'in_treatment' })).status).toBe(200);
    expect((await patch({ status: 'transferred' })).status).toBe(200);
    const [[closed]] = await db.query('SELECT status FROM bed_requests WHERE emergency_case_id = ?', [case2]);
    expect(closed.status).toBe('cancelled');
  });
});

afterAll(closeTestConnections);
