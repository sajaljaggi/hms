const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const { generateSlotsForDoctorDate, cleanupPastSlots } = require('../../utils/generateSlots');
const { createUserSession, authed, cleanupUsers, closeTestConnections } = require('../helpers/session');

const PDF = Buffer.from('%PDF-1.4\n% test prescription\n%%EOF\n');
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n) => localDate(new Date(Date.now() + n * 86400000));

describe('hardening: files, prescriptions, cancellation, deletes, slots, admin edits', () => {
  let doctor, otherDoctor, patient, stranger, admin;
  const ids = [];
  let slotSeq = 0;

  const seedSlot = async (date = inDays(2), time) => {
    slotSeq += 1;
    const [s] = await db.query('INSERT INTO doctor_slots (doctor_id, date, time) VALUES (?, ?, ?)',
      [doctor.doctorId, date, time || `1${slotSeq % 10}:${pad((slotSeq * 7) % 60)}:00`]);
    return s.insertId;
  };
  const fresh = async (role = 'patient') => { const s = await createUserSession(role); ids.push(s.userId); return s; };
  const book = async (who, slotId) => {
    const res = await authed(request(app).post, '/api/appointments/book', who).send({ doctorId: doctor.doctorId, slotId });
    expect(res.status).toBe(201);
    return res.body.appointmentId;
  };
  const markPaid = async (apptId, patientId) => {
    await db.query("UPDATE appointments SET payment_status = 'paid' WHERE id = ?", [apptId]);
    await db.query(
      "INSERT INTO payments (appointment_id, patient_id, amount_paise, provider, provider_order_id, status) VALUES (?, ?, 50000, 'mock', ?, 'paid')",
      [apptId, patientId, `order_test_${apptId}`]
    );
  };
  // Prescribing needs a visit that has started: move the visit's slot to yesterday (a distinct time each call).
  let startedSeq = 0;
  const started = (apptId) => db.query(
    'UPDATE doctor_slots ds JOIN appointments a ON a.slot_id = ds.id SET ds.date = ?, ds.time = ? WHERE a.id = ?',
    [inDays(-1), `07:${pad(startedSeq++)}:00`, apptId]
  );
  const prescribe = (who, appointmentId, extra = (r) => r) =>
    extra(authed(request(app).post, '/api/doctor/prescription', who).field('appointmentId', String(appointmentId)).field('notes', 'Rest'));

  beforeAll(async () => {
    doctor = await fresh('doctor');
    otherDoctor = await fresh('doctor');
    patient = await fresh();
    stranger = await fresh();
    admin = await fresh('admin');
  });
  afterAll(() => cleanupUsers(ids));

  test('security headers are set and Express is not advertised', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('the old public uploads folder and the chatbot booking shortcut are gone', async () => {
    expect((await request(app).get('/uploads/anything.pdf')).status).toBe(404);
    expect((await authed(request(app).post, '/api/chatbot/book', patient).send({ doctorId: 1, slotId: 1 })).status).toBe(404);
  });

  test('prescription file: stored in the DB, only its patient and doctor can open it', async () => {
    const apptId = await book(patient, await seedSlot());
    await started(apptId);
    // A spoofed patientId is ignored: the prescription belongs to the appointment's patient.
    const res = await prescribe(doctor, apptId, (r) => r.field('patientId', String(stranger.userId)).attach('file', PDF, 'scan.pdf'));
    expect(res.status).toBe(201);
    expect(res.body.fileUrl).toMatch(/^\/api\/files\/prescriptions\/\d+$/);

    const [[p]] = await db.query('SELECT patient_id FROM prescriptions WHERE appointment_id = ?', [apptId]);
    expect(p.patient_id).toBe(patient.userId);
    expect((await authed(request(app).get, '/api/patient/medical-history', stranger)).body.data).toEqual([]);

    const own = await authed(request(app).get, res.body.fileUrl, patient);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('application/pdf');
    expect(own.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(own.body, PDF)).toBe(0);
    expect((await authed(request(app).get, res.body.fileUrl, doctor)).status).toBe(200);
    expect((await authed(request(app).get, res.body.fileUrl, stranger)).status).toBe(404);
    expect((await authed(request(app).get, res.body.fileUrl, otherDoctor)).status).toBe(404);
    expect((await request(app).get(res.body.fileUrl)).status).toBe(401);

    // Editing the notes without a new file keeps the file.
    const edit = await prescribe(doctor, apptId);
    expect(edit.status).toBe(201);
    expect(edit.body.fileUrl).toBe(res.body.fileUrl);
    expect((await authed(request(app).get, res.body.fileUrl, patient)).status).toBe(200);
  });

  test('uploads are checked by their real content, not their name', async () => {
    const apptId = await book(await fresh(), await seedSlot());
    await started(apptId);
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const res = await prescribe(doctor, apptId, (r) => r.attach('file', html, 'evil.pdf'));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only PDF, JPEG or PNG/);
    const [[a]] = await db.query('SELECT status FROM appointments WHERE id = ?', [apptId]);
    expect(a.status).toBe('pending');
  });

  test('doctor cancels a paid visit: slot freed, refund flagged, patient told, no reopening', async () => {
    const p = await fresh();
    const slotId = await seedSlot();
    const apptId = await book(p, slotId);
    await markPaid(apptId, p.userId);

    const status = (s) => authed(request(app).put, '/api/doctor/appointment-status', doctor).send({ appointmentId: apptId, status: s });
    expect((await status('pending')).status).toBe(400);
    expect((await status('cancelled')).status).toBe(200);
    expect((await status('completed')).status).toBe(409);
    expect((await status('cancelled')).status).toBe(409);

    const [[slot]] = await db.query('SELECT is_booked FROM doctor_slots WHERE id = ?', [slotId]);
    expect(slot.is_booked).toBe(0);
    const [[pay]] = await db.query('SELECT status FROM payments WHERE appointment_id = ?', [apptId]);
    expect(pay.status).toBe('refund_due');
    const [[n]] = await db.query("SELECT message FROM notifications WHERE user_id = ? AND title = 'Appointment cancelled'", [p.userId]);
    expect(n.message).toMatch(/refunded/);
    expect((await prescribe(doctor, apptId)).status).toBe(409);

    // Someone else can now book the freed slot.
    await book(await fresh(), slotId);
  });

  test('patient cancels their own future visit only; the doctor is told', async () => {
    const apptId = await book(patient, await seedSlot(inDays(3)));
    expect((await authed(request(app).post, `/api/patient/appointments/${apptId}/cancel`, stranger)).status).toBe(404);
    const res = await authed(request(app).post, `/api/patient/appointments/${apptId}/cancel`, patient);
    expect(res.status).toBe(200);
    const [[n]] = await db.query("SELECT message FROM notifications WHERE user_id = ? AND title = 'Appointment cancelled'", [doctor.userId]);
    expect(n.message).toMatch(/by the patient/);

    // A visit whose start time has passed cannot be cancelled by the patient.
    const past = await fresh();
    const pastAppt = await book(past, await seedSlot());
    await db.query('UPDATE doctor_slots ds JOIN appointments a ON a.slot_id = ds.id SET ds.date = ? WHERE a.id = ?', [inDays(-1), pastAppt]);
    const late = await authed(request(app).post, `/api/patient/appointments/${pastAppt}/cancel`, past);
    expect(late.status).toBe(400);
  });

  test('payment records block deletes; unpaid visits can still be deleted', async () => {
    const payer = await fresh();
    const paidAppt = await book(payer, await seedSlot());
    await markPaid(paidAppt, payer.userId);
    expect((await authed(request(app).delete, `/api/admin/appointments/${paidAppt}`, admin)).status).toBe(409);
    expect((await authed(request(app).delete, `/api/admin/user/${payer.userId}`, admin)).status).toBe(409);
    const [[still]] = await db.query('SELECT COUNT(*) AS n FROM payments WHERE appointment_id = ?', [paidAppt]);
    expect(still.n).toBe(1);

    const unpaid = await fresh();
    const unpaidAppt = await book(unpaid, await seedSlot());
    await db.query(
      "INSERT INTO payments (appointment_id, patient_id, amount_paise, provider, provider_order_id, status) VALUES (?, ?, 50000, 'mock', ?, 'failed')",
      [unpaidAppt, unpaid.userId, `order_test_${unpaidAppt}`]
    );
    expect((await authed(request(app).delete, `/api/admin/appointments/${unpaidAppt}`, admin)).status).toBe(200);
    expect((await authed(request(app).delete, `/api/admin/user/${unpaid.userId}`, admin)).status).toBe(200);
  });

  test('the nightly slot cleanup keeps cancelled visits (even with a payment) and removes only unused past slots', async () => {
    const payer = await fresh();
    const apptId = await book(payer, await seedSlot());
    await markPaid(apptId, payer.userId);
    expect((await authed(request(app).put, '/api/doctor/appointment-status', doctor).send({ appointmentId: apptId, status: 'cancelled' })).status).toBe(200);
    // Move the cancelled visit into the past, next to a past slot nobody booked.
    await db.query('UPDATE doctor_slots ds JOIN appointments a ON a.slot_id = ds.id SET ds.date = ? WHERE a.id = ?', [inDays(-2), apptId]);
    const [unused] = await db.query('INSERT INTO doctor_slots (doctor_id, date, time) VALUES (?, ?, ?)', [doctor.doctorId, inDays(-2), '08:00:00']);

    await expect(cleanupPastSlots()).resolves.toBeGreaterThanOrEqual(1); // must not throw on the payment
    const [[a]] = await db.query('SELECT status FROM appointments WHERE id = ?', [apptId]);
    expect(a.status).toBe('cancelled');
    const [gone] = await db.query('SELECT id FROM doctor_slots WHERE id = ?', [unused.insertId]);
    expect(gone).toEqual([]);
  });

  test('blocking a day survives the slot generator', async () => {
    const date = inDays(5);
    const res = await authed(request(app).delete, '/api/admin/slots/day', admin).send({ doctorId: doctor.doctorId, date });
    expect(res.status).toBe(200);
    expect(res.body.blocked).toBeGreaterThan(0);
    await generateSlotsForDoctorDate(doctor.doctorId, date); // what startup and the midnight cron run
    const [[open]] = await db.query(
      'SELECT COUNT(*) AS n FROM doctor_slots WHERE doctor_id = ? AND date = ? AND is_available = 1', [doctor.doctorId, date]
    );
    expect(open.n).toBe(0);
  });

  test('admin edits a patient: only sent fields change, a blank name is refused', async () => {
    const p = await fresh();
    await db.query("UPDATE users SET name = 'Asha', phone = '9000000000', city = 'Pune' WHERE id = ?", [p.userId]);
    const patch = (body, id = p.userId) => authed(request(app).patch, `/api/admin/users/${id}`, admin).send(body);
    expect((await patch({ phone: '' })).status).toBe(200);
    const [[u]] = await db.query('SELECT name, phone, city FROM users WHERE id = ?', [p.userId]);
    expect(u).toEqual({ name: 'Asha', phone: null, city: 'Pune' });
    expect((await patch({ name: '' })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ city: 'Goa' }, 999999)).status).toBe(404);
  });

  test('profile save: empty gender keeps the stored one, a blank or too-long name is a 400', async () => {
    const p = await fresh();
    const put = (body) => authed(request(app).put, '/api/patient/profile', p).send(body);
    expect((await put({ name: 'Asha Roy', gender: '' })).status).toBe(200); // the form's "not chosen"
    expect((await put({ name: '' })).status).toBe(400);
    expect((await put({ name: 'A'.repeat(101) })).status).toBe(400);
    expect((await put({ phone: '9'.repeat(21) })).status).toBe(400);
    const [[u]] = await db.query('SELECT name, gender FROM users WHERE id = ?', [p.userId]);
    expect(u).toEqual({ name: 'Asha Roy', gender: null });
    const reg = await request(app).post('/api/auth/register').set('Cookie', p.cookies).set('X-CSRF-Token', p.csrfToken)
      .set('X-Forwarded-For', '10.99.1.1').send({ name: 'B'.repeat(101), email: 'long@example.com', password: 'secret12' });
    expect(reg.status).toBe(400);
  });

  test('admin user list filters by role, searches and pages on the server', async () => {
    const tag = `Pagetest${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      const u = await fresh();
      await db.query('UPDATE users SET name = ? WHERE id = ?', [`${tag} ${i}`, u.userId]);
    }
    const list = (q) => authed(request(app).get, `/api/admin/users?${q}`, admin);
    const page1 = await list(`role=patient&q=${tag}&sort=name-asc&limit=2&page=1`);
    expect(page1.body).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(page1.body.data.map((u) => u.name)).toEqual([`${tag} 0`, `${tag} 1`]);
    expect((await list(`role=patient&q=${tag}&sort=name-asc&limit=2&page=2`)).body.data.map((u) => u.name)).toEqual([`${tag} 2`]);
    const all = await list('role=patient&limit=1');
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM users WHERE role = 'patient'");
    expect(all.body.total).toBe(n); // the dashboard's patient count
    expect((await list('limit=0')).status).toBe(400);
    expect((await list('role=nurse')).status).toBe(400);
    expect((await list('q=%25')).body.total).toBe(0); // LIKE wildcards are escaped
  });

  test('admin appointment list pages and searches on the server', async () => {
    const p = await fresh();
    await db.query("UPDATE users SET name = 'Zyxwv Searchable' WHERE id = ?", [p.userId]);
    const apptId = await book(p, await seedSlot());
    const res = await authed(request(app).get, '/api/admin/appointments?q=Zyxwv&status=pending&limit=5', admin);
    expect(res.body).toMatchObject({ total: 1, page: 1, limit: 5 });
    expect(res.body.data[0].id).toBe(apptId);
    expect((await authed(request(app).get, '/api/admin/appointments?status=done', admin)).status).toBe(400);
  });

  test('slots and bookings are limited to today and the next 13 days', async () => {
    const slots = (date) => request(app).get(`/api/slots?doctorId=${doctor.doctorId}&date=${date}`);
    expect((await slots(inDays(13))).status).toBe(200);
    expect((await slots(inDays(14))).status).toBe(400);
    expect((await slots('2099-12-31')).status).toBe(400);
    expect((await slots(inDays(-1))).status).toBe(400);
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM doctor_slots WHERE date = '2099-12-31'");
    expect(n).toBe(0); // the rejected request created nothing
    const far = await seedSlot(inDays(30), '10:00:00');
    const res = await authed(request(app).post, '/api/appointments/book', await fresh()).send({ doctorId: doctor.doctorId, slotId: far });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/up to 14 days ahead/);
  });

  test("a visit can't be completed or prescribed before it starts", async () => {
    const p = await fresh();
    const apptId = await book(p, await seedSlot(inDays(3)));
    const complete = await authed(request(app).put, '/api/doctor/appointment-status', doctor).send({ appointmentId: apptId, status: 'completed' });
    expect(complete.status).toBe(400);
    expect(complete.body.message).toMatch(/hasn't started/);
    expect((await prescribe(doctor, apptId)).status).toBe(400);
    const [[a]] = await db.query('SELECT status FROM appointments WHERE id = ?', [apptId]);
    expect(a.status).toBe('pending');
    // Cancelling a future visit is still allowed.
    expect((await authed(request(app).put, '/api/doctor/appointment-status', doctor).send({ appointmentId: apptId, status: 'cancelled' })).status).toBe(200);
  });

  test('a walk-in allocated by the admin can have an attending doctor, who then sees the patient', async () => {
    const [[ward]] = await db.query('SELECT id FROM wards LIMIT 1');
    const bedId = (await authed(request(app).post, '/api/beds', admin).send({ wardId: ward.id, bedNumber: `WI-${Date.now() % 100000}` })).body.data.id;
    const p = await fresh();
    const alloc = (body) => authed(request(app).post, `/api/beds/${bedId}/allocate`, admin).send(body);
    expect((await alloc({ patientId: p.userId, attendingDoctorId: p.userId })).status).toBe(404); // not a doctor
    expect((await alloc({ patientId: p.userId, attendingDoctorId: doctor.userId })).status).toBe(201);
    const mine = (await authed(request(app).get, '/api/beds/my-patients', doctor)).body.data;
    expect(mine.map((m) => m.patient_id)).toContain(p.userId);
    const [[n]] = await db.query("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND title = 'Patient admitted'", [doctor.userId]);
    expect(n.c).toBe(1);
    await db.query('DELETE FROM bed_allocations WHERE bed_id = ?', [bedId]);
    await db.query('DELETE FROM beds WHERE id = ?', [bedId]);
  });

  test('login limits: only failures count, and each account is limited on its own', async () => {
    const p = await fresh();
    const attempt = async (password, ip) => {
      const primer = await request(app).get('/api/health');
      const cookie = primer.headers['set-cookie'].find((c) => c.startsWith('csrf_token=')).split(';')[0];
      return request(app).post('/api/auth/login').set('X-Forwarded-For', ip).set('Cookie', cookie)
        .set('X-CSRF-Token', cookie.split('=')[1]).send({ email: p.email, password });
    };
    // 10 failures from 10 different IPs still lock this account (an attacker rotating IPs).
    for (let i = 0; i < 10; i++) expect((await attempt('wrong-pass', `10.66.${i}.1`)).status).toBe(401);
    expect((await attempt('wrong-pass', '10.66.200.1')).status).toBe(429);
    // Successes from one shared IP never trip the IP limit (a class behind one address).
    const q = await fresh();
    for (let i = 0; i < 12; i++) {
      const primer = await request(app).get('/api/health');
      const cookie = primer.headers['set-cookie'].find((c) => c.startsWith('csrf_token=')).split(';')[0];
      const r = await request(app).post('/api/auth/login').set('X-Forwarded-For', '10.77.0.1').set('Cookie', cookie)
        .set('X-CSRF-Token', cookie.split('=')[1]).send({ email: q.email, password: 'password123' });
      expect(r.status).toBe(200);
    }
  });
});

afterAll(closeTestConnections);
