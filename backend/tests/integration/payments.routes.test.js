const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const { createUserSession, authed, cleanupUsers, closeTestConnections } = require('../helpers/session');

const ENV_KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
const WEBHOOK_SECRET = 'whsec_test_only';

describe('payment routes (mock mode)', () => {
  let patient, other, doctor, admin, savedEnv;
  const ids = [];
  const eventIds = [];
  const post = (url, s, body) => authed(request(app).post, url, s).send(body);
  let slotSeq = 0;
  const bookAppointment = async (patientId) => {
    slotSeq += 1;
    const d = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const [s] = await db.query('INSERT INTO doctor_slots (doctor_id, date, time, is_booked) VALUES (?, ?, ?, 1)', [doctor.doctorId, d, `1${slotSeq}:00:00`]);
    const [a] = await db.query("INSERT INTO appointments (patient_id, doctor_id, slot_id, status) VALUES (?, ?, ?, 'pending')", [patientId, doctor.doctorId, s.insertId]);
    return a.insertId;
  };
  const paidNotes = async (apptId) => (await db.query(
    "SELECT user_id FROM notifications WHERE type = 'payment' AND message LIKE ?", [`%appointment #${apptId}%`]
  ))[0].map((n) => n.user_id).sort();
  const apptPaymentStatus = async (id) => (await db.query('SELECT payment_status FROM appointments WHERE id = ?', [id]))[0][0].payment_status;
  const sendWebhook = (bodyObj, eventId, secret = WEBHOOK_SECRET) => {
    const raw = JSON.stringify(bodyObj);
    eventIds.push(eventId);
    return request(app).post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-event-id', eventId)
      .set('x-razorpay-signature', crypto.createHmac('sha256', secret).update(raw).digest('hex'))
      .send(raw);
  };

  beforeAll(async () => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k]; // mock mode: never call the real Razorpay API
    doctor = await createUserSession('doctor', { fees: 750.5 });
    patient = await createUserSession('patient');
    other = await createUserSession('patient');
    admin = await createUserSession('admin');
    ids.push(doctor.userId, patient.userId, other.userId, admin.userId);
  });
  afterAll(async () => {
    for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
    if (eventIds.length) await db.query('DELETE FROM payment_webhook_events WHERE event_id IN (?)', [eventIds]);
    await cleanupUsers(ids); // cascades doctor, slots, appointments, payments, notifications
  });

  test('order -> verify -> paid, idempotent re-verify, tampered 400, other patient 404', async () => {
    const apptId = await bookAppointment(patient.userId);

    expect((await post('/api/payments/orders', other, { appointmentId: apptId })).status).toBe(404);
    expect((await post('/api/payments/orders', doctor, { appointmentId: apptId })).status).toBe(403);

    const order = await post('/api/payments/orders', patient, { appointmentId: apptId, amount: 1 });
    expect(order.status).toBe(200);
    const o = order.body.data;
    expect(o).toMatchObject({ amount: 75050, currency: 'INR', mode: 'mock', appointmentId: apptId });
    expect(o.keyId).toBeUndefined();
    expect(o.orderId).toMatch(/^order_mock_[0-9a-f]{24}$/);

    // An unchanged created order is reused.
    expect((await post('/api/payments/orders', patient, { appointmentId: apptId })).body.data.orderId).toBe(o.orderId);

    const body = { orderId: o.orderId, paymentId: o.mock.paymentId, signature: o.mock.signature };
    expect((await post('/api/payments/verify', other, body)).status).toBe(404);
    const tampered = await post('/api/payments/verify', patient, { ...body, signature: '0'.repeat(64) });
    expect(tampered.status).toBe(400);
    const [[row]] = await db.query('SELECT status FROM payments WHERE provider_order_id = ?', [o.orderId]);
    expect(row.status).toBe('created'); // a bad signature does not mark it failed

    const ok = await post('/api/payments/verify', patient, body);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ alreadyPaid: false, appointmentId: apptId });
    expect(await apptPaymentStatus(apptId)).toBe('paid');
    const [notes] = await db.query("SELECT user_id FROM notifications WHERE type = 'payment' AND user_id IN (?)", [[patient.userId, doctor.userId]]);
    expect(notes.map((n) => n.user_id).sort()).toEqual([patient.userId, doctor.userId].sort());

    const again = await post('/api/payments/verify', patient, body);
    expect(again.status).toBe(200);
    expect(again.body.data.alreadyPaid).toBe(true);
    expect((await post('/api/payments/orders', patient, { appointmentId: apptId })).status).toBe(409);

    const my = await authed(request(app).get, '/api/payments/my', patient);
    expect(my.body.data[0]).toMatchObject({ appointment_id: apptId, status: 'paid', amount_paise: 75050, provider_payment_id: o.mock.paymentId, specialization: 'General Medicine' });
    expect((await authed(request(app).get, '/api/payments/my', other)).body.data).toEqual([]);

    const list = await authed(request(app).get, '/api/payments', admin);
    expect(list.status).toBe(200);
    expect(list.body.data.some((p) => p.appointment_id === apptId && p.patient_name)).toBe(true);
    expect(list.body.summary.paidCount).toBeGreaterThanOrEqual(1);
    expect((await authed(request(app).get, '/api/payments', patient)).status).toBe(403);

    const appts = await authed(request(app).get, '/api/patient/appointments', patient);
    expect(appts.body.data.find((a) => a.id === apptId).payment_status).toBe('paid');
  });

  test('cancelled or completed appointment -> 400, fail endpoint marks the order failed, the next order reuses it', async () => {
    const cancelled = await bookAppointment(patient.userId);
    await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [cancelled]);
    expect((await post('/api/payments/orders', patient, { appointmentId: cancelled })).status).toBe(400);
    const completed = await bookAppointment(patient.userId);
    await db.query("UPDATE appointments SET status = 'completed' WHERE id = ?", [completed]);
    const res = await post('/api/payments/orders', patient, { appointmentId: completed });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Only upcoming appointments can be paid.');

    const apptId = await bookAppointment(patient.userId);
    const first = (await post('/api/payments/orders', patient, { appointmentId: apptId })).body.data;
    expect((await post(`/api/payments/orders/${first.orderId}/fail`, other, {})).status).toBe(404);
    // The 404 alone would not catch a missing ownership check on the UPDATE: the row must be untouched.
    const [[untouched]] = await db.query('SELECT status FROM payments WHERE provider_order_id = ?', [first.orderId]);
    expect(untouched.status).toBe('created');
    const fail = await post(`/api/payments/orders/${first.orderId}/fail`, patient, {});
    expect(fail.status).toBe(200);
    expect(fail.body.data.status).toBe('failed');
    const second = (await post('/api/payments/orders', patient, { appointmentId: apptId })).body.data;
    expect(second.orderId).toBe(first.orderId); // Razorpay orders accept retries until paid
    const [rows] = await db.query('SELECT status, provider_order_id FROM payments WHERE appointment_id = ?', [apptId]);
    expect(rows).toEqual([{ status: 'created', provider_order_id: first.orderId }]);

    // An amount change creates a new gateway order.
    await db.query('UPDATE doctors SET fees = 800 WHERE id = ?', [doctor.doctorId]);
    try {
      const third = (await post('/api/payments/orders', patient, { appointmentId: apptId })).body.data;
      expect(third).toMatchObject({ amount: 80000 });
      expect(third.orderId).not.toBe(first.orderId);
    } finally {
      await db.query('UPDATE doctors SET fees = 750.5 WHERE id = ?', [doctor.doctorId]);
    }

    // A row created in another provider mode is not verified with this mode's secret.
    const mismatch = await bookAppointment(patient.userId);
    const m = (await post('/api/payments/orders', patient, { appointmentId: mismatch })).body.data;
    await db.query("UPDATE payments SET provider = 'razorpay' WHERE provider_order_id = ?", [m.orderId]);
    const bad = await post('/api/payments/verify', patient, { orderId: m.orderId, paymentId: m.mock.paymentId, signature: m.mock.signature });
    expect(bad.status).toBe(400);
    expect(await apptPaymentStatus(mismatch)).toBe('unpaid');
  });

  test('webhook: valid HMAC marks paid, duplicate event id is deduped, bad signature 400, no CSRF needed', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    try {
      const apptId = await bookAppointment(patient.userId);
      const { orderId } = (await post('/api/payments/orders', patient, { appointmentId: apptId })).body.data;
      const event = { event: 'payment.captured', payload: { payment: { entity: { id: `pay_wh_${Date.now()}`, order_id: orderId } } } };
      const eventId = `evt_test_${Date.now()}`;

      expect((await sendWebhook(event, `${eventId}_bad`, 'wrong_secret')).status).toBe(400);
      expect(await apptPaymentStatus(apptId)).toBe('unpaid');

      const res = await sendWebhook(event, eventId);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ received: true });
      expect(await apptPaymentStatus(apptId)).toBe('paid');
      expect(await paidNotes(apptId)).toEqual([patient.userId, doctor.userId].sort()); // webhook path notifies too

      const dup = await sendWebhook(event, eventId);
      expect(dup.status).toBe(200);
      expect(dup.body.data).toEqual({ duplicate: true });

      const unknown = await sendWebhook({ event: 'refund.created', payload: {} }, `${eventId}_u`);
      expect(unknown.body.data).toEqual({ ignored: true });

      // payment.failed never downgrades a paid order.
      await sendWebhook({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_x', order_id: orderId } } } }, `${eventId}_f`);
      const [[row]] = await db.query('SELECT status FROM payments WHERE provider_order_id = ?', [orderId]);
      expect(row.status).toBe('paid');
    } finally {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    }
  });

  test('webhook payment.failed marks failed, and the next order reuses the same order id', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    try {
      const apptId = await bookAppointment(patient.userId);
      const { orderId } = (await post('/api/payments/orders', patient, { appointmentId: apptId })).body.data;
      const res = await sendWebhook({ event: 'payment.failed', payload: { payment: { entity: { id: `pay_f_${Date.now()}`, order_id: orderId } } } }, `evt_fail_${Date.now()}`);
      expect(res.status).toBe(200);
      const [[row]] = await db.query('SELECT status FROM payments WHERE provider_order_id = ?', [orderId]);
      expect(row.status).toBe('failed');
      expect(await apptPaymentStatus(apptId)).toBe('unpaid');
      expect((await post('/api/payments/orders', patient, { appointmentId: apptId })).body.data.orderId).toBe(orderId);
    } finally {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    }
  });

  test('late capture on a replaced order falls back to the appointment in the order notes', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const apptId = await bookAppointment(patient.userId);
      const { orderId: oldOrder } = (await post('/api/payments/orders', patient, { appointmentId: apptId })).body.data;
      const newOrder = `order_mock_replaced${Date.now()}`;
      await db.query('UPDATE payments SET provider_order_id = ? WHERE provider_order_id = ?', [newOrder, oldOrder]);
      const payId = `pay_late_${Date.now()}`;
      const event = { event: 'payment.captured', payload: { payment: { entity: { id: payId, order_id: oldOrder, notes: { appointmentId: String(apptId) } } } } };
      const res = await sendWebhook(event, `evt_late_${Date.now()}`);
      expect(res.status).toBe(200);
      expect(await apptPaymentStatus(apptId)).toBe('paid');
      const [[row]] = await db.query('SELECT status, provider_order_id, provider_payment_id FROM payments WHERE appointment_id = ?', [apptId]);
      expect(row).toEqual({ status: 'paid', provider_order_id: oldOrder, provider_payment_id: payId });
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes('RECONCILE'))).toBe(true);
      expect(await paidNotes(apptId)).toEqual([patient.userId, doctor.userId].sort());

      // No resolvable appointment: logged loudly and still acknowledged.
      errSpy.mockClear();
      const lost = await sendWebhook({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_lost', order_id: 'order_unknown_x' } } } }, `evt_lost_${Date.now()}`);
      expect(lost.status).toBe(200);
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes('could not be matched'))).toBe(true);
    } finally {
      errSpy.mockRestore();
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    }
  });

  test('webhook with the secret unset is rejected, and other POSTs still require CSRF', async () => {
    expect((await sendWebhook({ event: 'order.paid' }, `evt_nosecret_${Date.now()}`)).status).toBe(400);
    const noCsrf = await request(app).post('/api/payments/orders').set('Cookie', patient.cookies).send({ appointmentId: 1 });
    expect(noCsrf.status).toBe(403);
  });
});

afterAll(closeTestConnections);
