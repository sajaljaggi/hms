const crypto = require('crypto');
const db = require('../config/db');
const { AppError, NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { inTransaction } = require('../utils/transaction');
const { notifyUsers } = require('../services/notificationService');
const gateway = require('../services/paymentGateway');

// Every write to a payment row either holds the appointment row lock (createOrder, markPaid)
// or is a single conditional UPDATE. Lock order is always appointment -> payment.
// payments is never read FOR UPDATE by appointment_id: on a missing row that takes a gap lock,
// and two concurrent first-time INSERTs into the same gap deadlock.

async function loadAppointment(q, appointmentId, patientId, lock) {
  const [rows] = await q.query(
    `SELECT status, payment_status, doctor_id FROM appointments WHERE id = ? AND patient_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [appointmentId, patientId]
  );
  if (rows.length === 0) throw new NotFoundError('Appointment not found.');
  const a = rows[0];
  if (a.status === 'cancelled') throw new ValidationError('This appointment is cancelled.');
  if (a.payment_status === 'paid') throw new ConflictError('This appointment is already paid.');
  // The amount always comes from the doctor's fee in the DB, never from the client.
  const [[d]] = await q.query('SELECT ROUND(fees * 100) AS amount_paise FROM doctors WHERE id = ?', [a.doctor_id]);
  const amount = Number(d.amount_paise);
  if (!(amount > 0)) throw new ValidationError('This appointment has no fee to pay.');
  return amount;
}

const PAYMENT_BY_APPT = 'SELECT id, provider_order_id, amount_paise, provider, status FROM payments WHERE appointment_id = ?';
const reusable = (p, amount, mode) => p && p.status === 'created' && p.amount_paise === amount && p.provider === mode;

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
      if (reusable(p, lockedAmount, mode)) return p.provider_order_id;
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

// Idempotent. Returns null when the order id is unknown.
async function markPaid(conn, orderId, paymentId) {
  const [[ref]] = await conn.query('SELECT appointment_id FROM payments WHERE provider_order_id = ?', [orderId]);
  if (!ref) return null;
  await conn.query('SELECT id FROM appointments WHERE id = ? FOR UPDATE', [ref.appointment_id]);
  const [[p]] = await conn.query('SELECT id, status FROM payments WHERE provider_order_id = ? FOR UPDATE', [orderId]);
  if (!p) return null; // the order was replaced between the read and the lock
  if (p.status === 'paid') return { alreadyPaid: true, appointmentId: ref.appointment_id };
  await conn.query("UPDATE payments SET status = 'paid', provider_payment_id = ?, paid_at = NOW() WHERE id = ?", [paymentId, p.id]);
  await conn.query("UPDATE appointments SET payment_status = 'paid' WHERE id = ?", [ref.appointment_id]);
  return { alreadyPaid: false, appointmentId: ref.appointment_id };
}

// POST /api/payments/verify
const verifyPayment = async (req, res, next) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    const result = await inTransaction(async (conn) => {
      const [[own]] = await conn.query(
        `SELECT d.user_id AS doctor_user_id FROM payments p
         JOIN appointments a ON a.id = p.appointment_id
         JOIN doctors d ON d.id = a.doctor_id
         WHERE p.provider_order_id = ? AND p.patient_id = ?`,
        [orderId, req.user.id]
      );
      if (!own) throw new NotFoundError('Payment not found.');
      // A bad signature changes nothing (the payment is not marked failed).
      if (!gateway.verifyCheckoutSignature(orderId, paymentId, signature)) throw new ValidationError('Invalid payment signature.');
      const r = await markPaid(conn, orderId, paymentId);
      if (!r) throw new NotFoundError('Payment not found.');
      return { ...r, doctorUserId: own.doctor_user_id };
    });

    if (!result.alreadyPaid) {
      const payload = { type: 'payment', title: 'Payment received' };
      await notifyUsers([req.user.id], { ...payload, message: `Your payment for appointment #${result.appointmentId} was successful.`, link: '/patient/history' });
      await notifyUsers([result.doctorUserId], { ...payload, message: `Payment received for appointment #${result.appointmentId}.`, link: '/doctor/appointments' });
    }
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

    const result = await inTransaction(async (conn) => {
      try {
        await conn.query('INSERT INTO payment_webhook_events (event_id, event_type) VALUES (?, ?)', [eventId, type]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return { duplicate: true };
        throw err;
      }
      if ((type === 'payment.captured' || type === 'order.paid') && typeof orderId === 'string' && typeof payment?.id === 'string') {
        await markPaid(conn, orderId, payment.id);
        return { received: true };
      }
      if (type === 'payment.failed' && typeof orderId === 'string') {
        await conn.query("UPDATE payments SET status = 'failed' WHERE provider_order_id = ? AND status <> 'paid'", [orderId]);
        return { received: true };
      }
      return { ignored: true };
    });
    res.json({ success: true, data: result });
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

// GET /api/payments (admin)
const listPayments = async (req, res, next) => {
  try {
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
       LIMIT 200`
    );
    const [[s]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_paise END), 0) AS total_paid,
              COALESCE(SUM(status = 'paid'), 0) AS paid_count,
              COALESCE(SUM(status = 'created'), 0) AS pending_count
       FROM payments`
    );
    res.json({ success: true, data: rows, summary: { totalPaidPaise: +s.total_paid, paidCount: +s.paid_count, pendingCount: +s.pending_count } });
  } catch (err) { next(err); }
};

module.exports = { createOrder, verifyPayment, webhook, failOrder, myPayments, listPayments, markPaid };
