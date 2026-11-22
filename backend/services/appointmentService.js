const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { invalidateCache, availabilityKey } = require('../utils/cache');
const { toDateStr } = require('../utils/dates');
const { notifyUsers } = require('./notificationService');

// The only status changes allowed: a visit is pending until it is completed or cancelled, never reopened.
// Lock order: appointment row, then its slot row (booking never holds an appointment lock while taking a slot).

// Locks the appointment. `actor` = { role, userId }; a doctor or patient may only touch their own visits
// (anyone else gets 404, so the visit's existence is not revealed).
async function lockForChange(conn, appointmentId, actor) {
  const [[a]] = await conn.query(
    'SELECT id, patient_id, doctor_id, slot_id, status, payment_status FROM appointments WHERE id = ? FOR UPDATE',
    [appointmentId]
  );
  const [[d]] = a ? await conn.query('SELECT user_id FROM doctors WHERE id = ?', [a.doctor_id]) : [[]];
  const owns = a && (actor.role === 'admin'
    || (actor.role === 'doctor' && d && d.user_id === actor.userId)
    || (actor.role === 'patient' && a.patient_id === actor.userId));
  if (!owns) throw new NotFoundError('Appointment not found.');
  if (a.status !== 'pending') throw new ConflictError(`This appointment is already ${a.status}.`);
  const [[slot]] = await conn.query('SELECT date, time FROM doctor_slots WHERE id = ?', [a.slot_id]);
  return { ...a, doctorUserId: d ? d.user_id : null, dateStr: toDateStr(slot.date), time: slot.time };
}

async function completeAppointment(conn, appointmentId, actor) {
  const a = await lockForChange(conn, appointmentId, actor);
  await conn.query("UPDATE appointments SET status = 'completed' WHERE id = ?", [a.id]);
  return a;
}

// Frees the slot for someone else and flags a paid visit for refund. Patients may only cancel before the start.
async function cancelAppointment(conn, appointmentId, actor) {
  const a = await lockForChange(conn, appointmentId, actor);
  if (actor.role === 'patient' && new Date(`${a.dateStr}T${a.time}`) <= new Date()) {
    throw new ValidationError('This appointment has already started and can no longer be cancelled.');
  }
  await conn.query("UPDATE appointments SET status = 'cancelled', active_slot_id = NULL WHERE id = ?", [a.id]);
  await conn.query('UPDATE doctor_slots SET is_booked = 0 WHERE id = ?', [a.slot_id]);
  let refundDue = false;
  if (a.payment_status === 'paid') {
    const [r] = await conn.query("UPDATE payments SET status = 'refund_due' WHERE appointment_id = ? AND status = 'paid'", [a.id]);
    refundDue = r.affectedRows > 0;
  } else {
    // A checkout still open for this visit must not be able to complete it now.
    await conn.query("UPDATE payments SET status = 'failed' WHERE appointment_id = ? AND status = 'created'", [a.id]);
  }
  return { ...a, refundDue };
}

// After commit: the cached slot list is stale, and the other side should hear about it.
async function afterCancel(a, actor) {
  await invalidateCache(availabilityKey(a.doctor_id, a.dateStr));
  const when = `${a.dateStr} at ${String(a.time).slice(0, 5)}`;
  if (actor.role !== 'patient') {
    await notifyUsers([a.patient_id], {
      type: 'appointment', title: 'Appointment cancelled', link: '/patient/history',
      message: `Your appointment on ${when} was cancelled by the ${actor.role === 'doctor' ? 'doctor' : 'hospital'}.`
        + (a.refundDue ? ' Your payment will be refunded.' : ''),
    });
  }
  if (actor.role !== 'doctor' && a.doctorUserId) {
    await notifyUsers([a.doctorUserId], {
      type: 'appointment', title: 'Appointment cancelled', link: '/doctor/appointments',
      message: `The appointment on ${when} was cancelled${actor.role === 'patient' ? ' by the patient' : ''}.`,
    });
  }
}

module.exports = { completeAppointment, cancelAppointment, afterCancel };
