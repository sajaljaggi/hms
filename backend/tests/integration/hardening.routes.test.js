const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const { generateSlotsForDoctorDate } = require('../../utils/generateSlots');
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
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const res = await prescribe(doctor, apptId, (r) => r.attach('file', html, 'evil.pdf'));
    expect(res.status).toBe(400);
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
});

afterAll(closeTestConnections);
