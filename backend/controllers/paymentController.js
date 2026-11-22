const crypto = require('crypto');
const db = require('../config/db');
const { AppError, NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { inTransaction } = require('../utils/transaction');
const { notifyUsers } = require('../services/notificationService');
const gateway = require('../services/paymentGateway');
const { MINUTES_AFTER_START } = require('../utils/dates');

// Every write to a payment row either holds the appointment row lock (createOrder, markPaid)
// or is a single conditional UPDATE. Lock order is always appointment -> payment.
// payments is never read FOR UPDATE by appointment_id: on a missing row that takes a gap lock,
// and two concurrent first-time INSERTs into the same gap deadlock.

async function loadAppointment(q, appointmentId, patientId, lock) {
  const [rows] = await q.query(
    `SELECT status, payment_status, doctor_id, slot_id FROM appointments WHERE id = ? AND patient_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [appointmentId, patientId]
  );
  if (rows.length === 0) throw new NotFoundError('Appointment not found.');
  const a = rows[0];
  if (a.status === 'cancelled') throw new ValidationError('This appointment is cancelled.');
  if (a.payment_status === 'paid') throw new ConflictError('This appointment is already paid.');
  if (a.status !== 'pending') throw new ValidationError('Only upcoming appointments can be paid.');
  // Separate unlocked read: a JOIN ... FOR UPDATE would also lock the slot row, outside the lock order.
  const [[slot]] = await q.query(
    'SELECT TIMESTAMP(date, time) + INTERVAL ? MINUTE < NOW() AS past FROM doctor_slots WHERE id = ?',
    [MINUTES_AFTER_START, a.slot_id]
  );
  if (!slot || Number(slot.past)) throw new ValidationError('This appointment time has passed.');
  // The amount always comes from the doctor's fee in the DB, never from the client.
  const [[d]] = await q.query('SELECT ROUND(fees * 100) AS amount_paise FROM doctors WHERE id = ?', [a.doctor_id]);
  const amount = Number(d.amount_paise);
  if (!(amount > 0)) throw new ValidationError('This appointment has no fee to pay.');
  return amount;
}

const PAYMENT_BY_APPT = 'SELECT id, provider_order_id, amount_paise, provider, status FROM payments WHERE appointment_id = ?';
// Razorpay orders accept retries until paid, so a created or failed order is reused while the amount and
// provider are unchanged. Keeping one order id per appointment means a late capture still matches its row.
const reusable = (p, amount, mode) => p && p.status !== 'paid' && p.amount_paise === amount && p.provider === mode;

// POST /api/payments/orders
// inTransaction retries its callback on deadlock, so the gateway call (an external side effect)
// cannot run inside it: (1) unlocked validate, (2) gateway order outside any transaction,
// (3) transaction that locks the appointment, re-checks it and upserts the payment row.
const createOrder = async (req, res, next) => {
  try {
    const mode = gateway.getMode();
    if (!mode) throw new AppError('Online payment is not configured.', 503, 'PAYMENT_NOT_CONFIGURED');
    const { appointmentId } = req.body;
    const patientId = req.user.id;

    const amount = await loadAppointment(db, appointmentId, patientId, false);
    const [[existing]] = await db.query(PAYMENT_BY_APPT, [appointmentId]);
    let freshOrderId = null;
    if (!reusable(existing, amount, mode)) {
      const order = await gateway.createOrder({ amountPaise: amount, receipt: `appt_${appointmentId}`, notes: { appointmentId: String(appointmentId) } });
      freshOrderId = order.id;
    }

    const orderId = await inTransaction(async (conn) => {
      const lockedAmount = await loadAppointment(conn, appointmentId, patientId, true);
      const [[p]] = await conn.query(PAYMENT_BY_APPT, [appointmentId]);
      // Nothing changed, or a concurrent request already stored a usable order: hand out that one.
      if (reusable(p, lockedAmount, mode)) {
        if (p.status !== 'created') await conn.query("UPDATE payments SET status = 'created' WHERE id = ?", [p.id]);
        return p.provider_order_id;
      }
      if (!freshOrderId || lockedAmount !== amount) throw new ConflictError('Payment details changed, please retry.');
      if (p) {
        await conn.query(
          `UPDATE payments SET amount_paise = ?, provider = ?, provider_order_id = ?, provider_payment_id = NULL,
             status = 'created', paid_at = NULL WHERE id = ?`,
          [amount, mode, freshOrderId, p.id]
        );
      } else {
        await conn.query(
          'INSERT INTO payments (appointment_id, patient_id, amount_paise, provider, provider_order_id) VALUES (?, ?, ?, ?, ?)',
          [appointmentId, patientId, amount, mode, freshOrderId]
        );
      }
      return freshOrderId;
    });

    const data = { orderId, amount, currency: 'INR', mode, appointmentId };
    if (mode === 'razorpay') data.keyId = process.env.RAZORPAY_KEY_ID;
    if (mode === 'mock') {
      const paymentId = `pay_mock_${crypto.randomBytes(12).toString('hex')}`;
      data.mock = { paymentId, signature: gateway.signCheckout(orderId, paymentId) };
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// Idempotent. Finds the payment by order id, or by fallbackAppointmentId (webhook order notes) when that
// order id is no longer stored. Returns null when neither resolves to a payment row.
async function markPaid(conn, orderId, paymentId, fallbackAppointmentId = null) {
  const [[ref]] = await conn.query('SELECT appointment_id FROM payments WHERE provider_order_id = ?', [orderId]);
  const appointmentId = ref ? ref.appointment_id : fallbackAppointmentId;
  if (!appointmentId) return null;
  const [[a]] = await conn.query('SELECT patient_id, doctor_id FROM appointments WHERE id = ? FOR UPDATE', [appointmentId]);
  if (!a) return null;
  const [[p]] = await conn.query('SELECT id, status, provider_order_id FROM payments WHERE appointment_id = ? FOR UPDATE', [appointmentId]);
  if (!p) return null;
  const [[d]] = await conn.query('SELECT user_id FROM doctors WHERE id = ?', [a.doctor_id]);
  const info = { appointmentId, patientId: a.patient_id, doctorUserId: d ? d.user_id : null };
  if (p.status === 'paid') {
    if (p.provider_order_id !== orderId) console.error(`[payments] RECONCILE: capture ${paymentId} on order ${orderId} for appointment ${appointmentId}, which is already paid via order ${p.provider_order_id}. Possible double charge, refund manually.`);
    return { ...info, alreadyPaid: true, transitioned: false };
  }
  if (p.provider_order_id !== orderId) {
    console.error(`[payments] RECONCILE: capture ${paymentId} on replaced order ${orderId} (stored ${p.provider_order_id}) marked appointment ${appointmentId} paid. Check the amount.`);
  }
  // The captured order becomes the stored one so the row matches what Razorpay charged.
  await conn.query("UPDATE payments SET status = 'paid', provider_order_id = ?, provider_payment_id = ?, paid_at = NOW() WHERE id = ?", [orderId, paymentId, p.id]);
  await conn.query("UPDATE appointments SET payment_status = 'paid' WHERE id = ?", [appointmentId]);
  return { ...info, alreadyPaid: false, transitioned: true };
}

// After commit, by whichever path performed the unpaid -> paid transition.
async function notifyPaid(r) {
  if (!r || !r.transitioned) return;
  const payload = { type: 'payment', title: 'Payment received' };
  await notifyUsers([r.patientId], { ...payload, message: `Your payment for appointment #${r.appointmentId} was successful.`, link: '/patient/history' });
  await notifyUsers([r.doctorUserId], { ...payload, message: `Payment received for appointment #${r.appointmentId}.`, link: '/doctor/appointments' });
}

// POST /api/payments/verify
const verifyPayment = async (req, res, next) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    const result = await inTransaction(async (conn) => {
      const [[own]] = await conn.query('SELECT provider FROM payments WHERE provider_order_id = ? AND patient_id = ?', [orderId, req.user.id]);
      if (!own) throw new NotFoundError('Payment not found.');
      // A row made in another mode (e.g. mock before keys were set) must not be verified with this mode's secret.
      if (own.provider !== gateway.getMode()) throw new ValidationError('This payment was created in a different payment mode.');
      // A bad signature changes nothing (the payment is not marked failed).
      if (!gateway.verifyCheckoutSignature(orderId, paymentId, signature)) throw new ValidationError('Invalid payment signature.');
      const r = await markPaid(conn, orderId, paymentId);
      if (!r) throw new NotFoundError('Payment not found.');
      return r;
    });

    await notifyPaid(result);
    res.json({ success: true, data: { alreadyPaid: result.alreadyPaid, appointmentId: result.appointmentId } });
  } catch (err) { next(err); }
};

// POST /api/payments/webhook (raw body, no auth, no CSRF: authenticated by HMAC)
const webhook = async (req, res, next) => {
  try {
    if (!gateway.verifyWebhookSignature(req.body, req.headers['x-razorpay-signature'])) {
      throw new ValidationError('Invalid webhook signature.');
    }
    const eventId = req.headers['x-razorpay-event-id'];
    if (typeof eventId !== 'string' || eventId.length === 0 || eventId.length > 100) throw new ValidationError('Missing event id.');
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); } catch { throw new ValidationError('Invalid JSON.'); }
    const type = typeof event?.event === 'string' ? event.event.slice(0, 60) : 'unknown';
    const payment = event?.payload?.payment?.entity;
    const orderId = payment?.order_id || event?.payload?.order?.entity?.id;
    // Set by createOrder. Trusted because the body is HMAC-verified.
    const noteApptId = Number(payment?.notes?.appointmentId ?? event?.payload?.order?.entity?.notes?.appointmentId);
    const fallbackAppointmentId = Number.isInteger(noteApptId) && noteApptId > 0 ? noteApptId : null;

    const result = await inTransaction(async (conn) => {
      try {
        await conn.query('INSERT INTO payment_webhook_events (event_id, event_type) VALUES (?, ?)', [eventId, type]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return { duplicate: true };
        throw err;
      }
      if ((type === 'payment.captured' || type === 'order.paid') && typeof orderId === 'string' && typeof payment?.id === 'string') {
        const r = await markPaid(conn, orderId, payment.id, fallbackAppointmentId);
        if (!r) console.error(`[payments] RECONCILE: capture ${payment.id} on unknown order ${orderId} (appointment ${fallbackAppointmentId}) could not be matched. Payment taken but not recorded.`);
        return { received: true, paid: r };
      }
      if (type === 'payment.failed' && typeof orderId === 'string') {
        await conn.query("UPDATE payments SET status = 'failed' WHERE provider_order_id = ? AND status <> 'paid'", [orderId]);
        return { received: true };
      }
      return { ignored: true };
    });
    const { paid, ...data } = result;
    await notifyPaid(paid);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// POST /api/payments/orders/:orderId/fail (checkout dismissed or failed client-side)
const failOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    await db.query(
      "UPDATE payments SET status = 'failed' WHERE provider_order_id = ? AND patient_id = ? AND status = 'created'",
      [orderId, req.user.id]
    );
    const [[p]] = await db.query('SELECT status FROM payments WHERE provider_order_id = ? AND patient_id = ?', [orderId, req.user.id]);
    if (!p) throw new NotFoundError('Payment not found.');
    res.json({ success: true, data: { status: p.status } });
  } catch (err) { next(err); }
};

// GET /api/payments/my
const myPayments = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.appointment_id, p.amount_paise, p.currency, p.provider, p.provider_order_id, p.provider_payment_id,
              p.status, p.paid_at, p.created_at, du.name AS doctor_name, d.specialization, ds.date, ds.time
       FROM payments p
       JOIN appointments a  ON a.id = p.appointment_id
       JOIN doctor_slots ds ON ds.id = a.slot_id
       JOIN doctors d       ON d.id = a.doctor_id
       JOIN users du        ON du.id = d.user_id
       WHERE p.patient_id = ?
       ORDER BY p.created_at DESC, p.id DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// GET /api/payments?page=&limit= (admin)
const listPayments = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const [rows] = await db.query(
      `SELECT p.id, p.appointment_id, p.amount_paise, p.currency, p.provider, p.provider_order_id, p.provider_payment_id,
              p.status, p.paid_at, p.created_at, pu.name AS patient_name, du.name AS doctor_name, ds.date, ds.time
       FROM payments p
       JOIN users pu        ON pu.id = p.patient_id
       JOIN appointments a  ON a.id = p.appointment_id
       JOIN doctor_slots ds ON ds.id = a.slot_id
       JOIN doctors d       ON d.id = a.doctor_id
       JOIN users du        ON du.id = d.user_id
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [limit, (page - 1) * limit]
    );
    const [[s]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_paise END), 0) AS total_paid,
              COALESCE(SUM(status = 'paid'), 0) AS paid_count,
              COALESCE(SUM(status = 'created'), 0) AS pending_count,
              COUNT(*) AS total
       FROM payments`
    );
    res.json({ success: true, data: rows, total: +s.total, page, limit, summary: { totalPaidPaise: +s.total_paid, paidCount: +s.paid_count, pendingCount: +s.pending_count } });
  } catch (err) { next(err); }
};

module.exports = { createOrder, verifyPayment, webhook, failOrder, myPayments, listPayments, markPaid };
