const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const { createUserSession, authed, cleanupUsers, closeTestConnections } = require('../helpers/session');

describe('teleconsult routes', () => {
  let doctor, patient, other, otherDoctor;
  const ids = [];
  const pad = (n) => String(n).padStart(2, '0');
  const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  // Seeds a slot starting `offsetMin` from now (local time, minute-rounded).
  const seedSlot = async (offsetMin) => {
    const d = new Date(Date.now() + offsetMin * 60000);
    const [s] = await db.query('INSERT INTO doctor_slots (doctor_id, date, time) VALUES (?, ?, ?)', [doctor.doctorId, localDate(d), localTime(d)]);
    return s.insertId;
  };
  const book = (slotId, extra = {}) =>
    authed(request(app).post, '/api/appointments/book', patient).send({ doctorId: doctor.doctorId, slotId, ...extra });
  const join = (s, id) => authed(request(app).get, `/api/teleconsult/${id}/join`, s);
  const status = (s, id) => authed(request(app).get, `/api/teleconsult/${id}/status`, s);
  const admit = (s, id) => authed(request(app).post, `/api/teleconsult/${id}/admit`, s);
  const room = async (id) => (await db.query('SELECT video_room, consultation_type FROM appointments WHERE id = ?', [id]))[0][0];

  beforeAll(async () => {
    doctor = await createUserSession('doctor');
    patient = await createUserSession('patient', { name: 'Pat Ient' });
    other = await createUserSession('patient');
    otherDoctor = await createUserSession('doctor');
    ids.push(doctor.userId, patient.userId, other.userId, otherDoctor.userId);
  });
  afterAll(() => cleanupUsers(ids));

  test('booking creates unique rooms for video only', async () => {
    const v1 = (await book(await seedSlot(120), { consultationType: 'video' })).body.appointmentId;
    const v2 = (await book(await seedSlot(180), { consultationType: 'video' })).body.appointmentId;
    const p = (await book(await seedSlot(240))).body.appointmentId;
    const [r1, r2, rp] = [await room(v1), await room(v2), await room(p)];
    expect(r1.video_room).toMatch(/^hms-[0-9a-f]{32}$/);
    expect(r1.video_room).not.toBe(r2.video_room);
    expect(rp).toEqual({ video_room: null, consultation_type: 'in_person' });
    const [n] = await db.query("SELECT message FROM notifications WHERE user_id = ? AND message LIKE '%video%'", [patient.userId]);
    expect(n.length).toBeGreaterThan(0);
  });

  test('join gates: 402, 200 patient and doctor, 404 stranger, 400 in-person, 403 outside window, then complete', async () => {
    const id = (await book(await seedSlot(2), { consultationType: 'video' })).body.appointmentId;
    const unpaid = await join(patient, id);
    expect(unpaid.status).toBe(402);
    expect(unpaid.body.error.code).toBe('PAYMENT_REQUIRED');

    await db.query("UPDATE appointments SET payment_status = 'paid' WHERE id = ?", [id]);
    expect((await status(doctor, id)).body.data).toEqual({ admitted: false, patientWaiting: false });

    // Paid patient waits: no room details until the doctor admits them.
    const waiting = await join(patient, id);
    expect(waiting.status).toBe(200);
    expect(waiting.body.data).toMatchObject({ waiting: true, role: 'patient', appointmentId: id });
    expect(waiting.body.data.roomName).toBeUndefined();
    expect((await status(doctor, id)).body.data).toEqual({ admitted: false, patientWaiting: true });

    const docRes = await join(doctor, id);
    expect(docRes.status).toBe(200);
    expect(docRes.body.data).toMatchObject({ waiting: false, role: 'doctor', roomName: (await room(id)).video_room, domain: 'meet.jit.si' });

    // Only this appointment's doctor sees the waiting room or admits.
    expect((await status(patient, id)).status).toBe(403);
    expect((await admit(patient, id)).status).toBe(403);
    expect((await status(otherDoctor, id)).status).toBe(404);
    expect((await admit(otherDoctor, id)).status).toBe(404);
    expect((await join(patient, id)).body.data.waiting).toBe(true);

    expect((await admit(doctor, id)).status).toBe(200);
    expect((await admit(doctor, id)).status).toBe(200); // idempotent
    expect((await status(doctor, id)).body.data).toEqual({ admitted: true, patientWaiting: false });
    const ok = await join(patient, id);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ waiting: false, roomName: (await room(id)).video_room, domain: 'meet.jit.si', displayName: 'Pat Ient', role: 'patient', appointmentId: id });
    expect(ok.body.data.jwt).toBeUndefined();
    expect((await join(other, id)).status).toBe(404);

    const inPerson = (await book(await seedSlot(3))).body.appointmentId;
    expect((await join(patient, inPerson)).status).toBe(400);

    const far = (await book(await seedSlot(300), { consultationType: 'video' })).body.appointmentId;
    await db.query("UPDATE appointments SET payment_status = 'paid' WHERE id = ?", [far]);
    const late = await join(patient, far);
    expect(late.status).toBe(403);
    expect(late.body.error.code).toBe('OUTSIDE_JOIN_WINDOW');
    expect(late.body.error.details.startsAt).toBeDefined();
    expect((await admit(doctor, far)).body.error.code).toBe('OUTSIDE_JOIN_WINDOW');

    expect((await authed(request(app).patch, `/api/teleconsult/${id}/complete`, patient)).status).toBe(403);
    expect((await authed(request(app).patch, `/api/teleconsult/${id}/complete`, doctor)).status).toBe(200);
    expect((await authed(request(app).patch, `/api/teleconsult/${id}/complete`, doctor)).status).toBe(409);
    expect((await join(patient, id)).status).toBe(409);
    const [n] = await db.query("SELECT 1 FROM notifications WHERE user_id = ? AND type = 'teleconsult'", [patient.userId]);
    expect(n.length).toBe(1);
  });
});

afterAll(closeTestConnections);
