const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const redis = require('../../config/redis');

function csrfFrom(res) {
  const setCookie = res.headers['set-cookie'] || [];
  const csrfCookie = setCookie.find((c) => c.startsWith('csrf_token='));
  const token = csrfCookie.split(';')[0].split('=')[1];
  return { cookie: csrfCookie.split(';')[0], header: token };
}

async function registerAndLoginPatient() {
  const email = `patient-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const primer = await request(app).get('/api/health');
  const csrf = csrfFrom(primer);

  const res = await request(app)
    .post('/api/auth/register')
    .set('Cookie', csrf.cookie)
    .set('X-CSRF-Token', csrf.header)
    .send({ name: 'Booking Test Patient', email, password: 'password123' });

  const authCookies = res.headers['set-cookie'].map((c) => c.split(';')[0]);
  return { email, cookies: [...authCookies, csrf.cookie].join('; '), csrfToken: csrf.header };
}

async function seedDoctorWithSlots(dateStr) {
  const [userResult] = await db.query(
    "INSERT INTO users (name, email, password, role) VALUES (?, ?, 'x', 'doctor')",
    [`Dr Test ${Date.now()}`, `doc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`]
  );
  const [doctorResult] = await db.query(
    'INSERT INTO doctors (user_id, specialization, fees) VALUES (?, ?, ?)',
    [userResult.insertId, 'Cardiology', 1000]
  );
  const doctorId = doctorResult.insertId;

  const [slotAResult] = await db.query(
    'INSERT INTO doctor_slots (doctor_id, date, time, is_booked, is_available) VALUES (?, ?, ?, 0, 1)',
    [doctorId, dateStr, '09:00:00']
  );
  const [slotBResult] = await db.query(
    'INSERT INTO doctor_slots (doctor_id, date, time, is_booked, is_available) VALUES (?, ?, ?, 0, 1)',
    [doctorId, dateStr, '09:15:00'] // back-to-back with slot A
  );

  return { doctorId, slotAId: slotAResult.insertId, slotBId: slotBResult.insertId };
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

describe('POST /api/appointments/book', () => {
  let patient;
  let doctorId;

  beforeAll(async () => {
    patient = await registerAndLoginPatient();
  });

  afterAll(async () => {
    if (doctorId) {
      await db.query('DELETE FROM doctors WHERE id = ?', [doctorId]);
    }
    await db.query('DELETE FROM users WHERE email = ?', [patient.email]);
  });

  test('successful booking, then double-booking the same slot is rejected with 409', async () => {
    const seeded = await seedDoctorWithSlots(tomorrowStr());
    doctorId = seeded.doctorId;

    const first = await request(app)
      .post('/api/appointments/book')
      .set('Cookie', patient.cookies)
      .set('X-CSRF-Token', patient.csrfToken)
      .send({ doctorId, slotId: seeded.slotAId });

    expect(first.status).toBe(201);
    expect(first.body.success).toBe(true);

    // A second patient tries to book the exact same slot.
    const otherPatient = await registerAndLoginPatient();
    const second = await request(app)
      .post('/api/appointments/book')
      .set('Cookie', otherPatient.cookies)
      .set('X-CSRF-Token', otherPatient.csrfToken)
      .send({ doctorId, slotId: seeded.slotAId });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');

    await db.query('DELETE FROM users WHERE email = ?', [otherPatient.email]);
  });

  test('back-to-back slots: booking one does not block booking its neighbor', async () => {
    const seeded = await seedDoctorWithSlots(tomorrowStr());
    doctorId = seeded.doctorId;

    const bookingA = await request(app)
      .post('/api/appointments/book')
      .set('Cookie', patient.cookies)
      .set('X-CSRF-Token', patient.csrfToken)
      .send({ doctorId, slotId: seeded.slotAId });

    const bookingB = await request(app)
      .post('/api/appointments/book')
      .set('Cookie', patient.cookies)
      .set('X-CSRF-Token', patient.csrfToken)
      .send({ doctorId, slotId: seeded.slotBId });

    expect(bookingA.status).toBe(201);
    expect(bookingB.status).toBe(201);
    expect(bookingA.body.appointmentId).not.toBe(bookingB.body.appointmentId);
  });

  test('booking a non-existent slot returns 404', async () => {
    const res = await request(app)
      .post('/api/appointments/book')
      .set('Cookie', patient.cookies)
      .set('X-CSRF-Token', patient.csrfToken)
      .send({ doctorId: 999999, slotId: 999999 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('a doctor role cannot book an appointment (403)', async () => {
    // requireRole('patient') should reject this before it ever reaches the
    // controller — confirms the role guard, not just the booking logic.
    const [userResult] = await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ('Role Test Doctor', ?, '$2a$10$abcdefghijklmnopqrstuv', 'doctor')",
      [`role-doc-${Date.now()}@example.com`]
    );

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: userResult.insertId, email: 'x@x.com', role: 'doctor', type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const primer = await request(app).get('/api/health');
    const csrf = csrfFrom(primer);

    const res = await request(app)
      .post('/api/appointments/book')
      .set('Cookie', [`access_token=${token}`, csrf.cookie].join('; '))
      .set('X-CSRF-Token', csrf.header)
      .send({ doctorId: 1, slotId: 1 });

    expect(res.status).toBe(403);
    await db.query('DELETE FROM users WHERE id = ?', [userResult.insertId]);
  });
});

describe('GET /api/slots caching (Redis cache-aside)', () => {
  let patient;
  let doctorId;

  beforeAll(async () => {
    patient = await registerAndLoginPatient();
  });

  afterAll(async () => {
    if (doctorId) {
      await db.query('DELETE FROM doctors WHERE id = ?', [doctorId]);
    }
    await db.query('DELETE FROM users WHERE email = ?', [patient.email]);
  });

  test('first request is a cache miss, second is a cache hit, booking invalidates it', async () => {
    const date = tomorrowStr();
    const seeded = await seedDoctorWithSlots(date);
    doctorId = seeded.doctorId;

    const first = await request(app)
      .get(`/api/slots?doctorId=${doctorId}&date=${date}`)
      .set('Cookie', patient.cookies);
    expect(first.status).toBe(200);
    expect(first.body.cached).toBe(false);

    const second = await request(app)
      .get(`/api/slots?doctorId=${doctorId}&date=${date}`)
      .set('Cookie', patient.cookies);
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
    // Cached payload must match what was actually computed, not just "truthy".
    expect(second.body.data).toEqual(first.body.data);

    const booking = await request(app)
      .post('/api/appointments/book')
      .set('Cookie', patient.cookies)
      .set('X-CSRF-Token', patient.csrfToken)
      .send({ doctorId, slotId: seeded.slotAId });
    expect(booking.status).toBe(201);

    // The cache entry should have been invalidated by the booking, so this
    // is a fresh miss that reflects the now-booked slot.
    const third = await request(app)
      .get(`/api/slots?doctorId=${doctorId}&date=${date}`)
      .set('Cookie', patient.cookies);
    expect(third.status).toBe(200);
    expect(third.body.cached).toBe(false);
    const bookedSlot = third.body.data.find((s) => s.id === seeded.slotAId);
    expect(bookedSlot.is_booked).toBe(1);
  });
});

// Runs once after every describe block above has finished, not per-block —
// closing these shared connections mid-file would break whichever describe
// block runs next.
afterAll(async () => {
  await db.end();
  redis.disconnect();
});
