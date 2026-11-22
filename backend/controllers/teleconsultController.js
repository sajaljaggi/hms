const db = require('../config/db');
const { AppError, NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { inTransaction } = require('../utils/transaction');
const { toDateStr, isWithinJoinWindow } = require('../utils/dates');
const { notifyUsers } = require('../services/notificationService');
const { videoAccess } = require('../utils/videoAccess');
const { completeAppointment } = require('../services/appointmentService');

// Patient owner or the appointment's doctor only; anyone else gets 404 so existence is not revealed.
const APPT_SQL = `SELECT a.id, a.patient_id, a.status, a.payment_status, a.consultation_type, a.video_room,
                         a.video_admitted_at, a.video_waiting_at > NOW() - INTERVAL 20 SECOND AS patient_waiting,
                         ds.date, ds.time, d.user_id AS doctor_user_id
                  FROM appointments a
                  JOIN doctor_slots ds ON a.slot_id = ds.id
                  JOIN doctors d ON a.doctor_id = d.id
                  WHERE a.id = ?`;

// Loads the appointment and throws unless this user may use its video room right now.
async function loadJoinable(appointmentId, user) {
  const [rows] = await db.query(APPT_SQL, [appointmentId]);
  const a = rows[0];
  const isDoctor = !!a && a.doctor_user_id === user.id;
  const isPatient = !!a && a.patient_id === user.id;
  if (!isDoctor && !isPatient) throw new NotFoundError('Appointment not found.');
  if (a.consultation_type !== 'video' || !a.video_room) throw new ValidationError('This is not a video consultation.');
  if (a.status !== 'pending') throw new ConflictError(`This appointment is ${a.status}.`);
  if (isPatient && a.payment_status !== 'paid') throw new AppError('Payment is required before joining.', 402, 'PAYMENT_REQUIRED');

  const dateStr = toDateStr(a.date);
  const startsAt = new Date(`${dateStr}T${a.time}`).toISOString();
  if (!isWithinJoinWindow(dateStr, a.time, new Date())) {
    const err = new AppError('You can join from 15 minutes before the start time until 60 minutes after.', 403, 'OUTSIDE_JOIN_WINDOW');
    err.details = { startsAt };
    throw err;
  }
  return { a, isDoctor, startsAt };
}

const join = async (req, res, next) => {
  try {
    const { a, isDoctor, startsAt } = await loadJoinable(req.params.appointmentId, req.user);
    const base = { role: isDoctor ? 'doctor' : 'patient', startsAt, appointmentId: a.id };

    // The patient waits until the doctor admits them; each poll refreshes "waiting" for the doctor's view.
    if (!isDoctor && !a.video_admitted_at) {
      await db.query('UPDATE appointments SET video_waiting_at = NOW() WHERE id = ?', [a.id]);
      return res.json({ success: true, data: { ...base, waiting: true } });
    }

    const [[u]] = await db.query('SELECT name, email FROM users WHERE id = ?', [req.user.id]);
    const displayName = u ? u.name : req.user.email;
    res.json({
      success: true,
      data: { ...base, waiting: false, displayName, ...videoAccess(a.video_room, { id: req.user.id, name: displayName, email: u?.email }, isDoctor) },
    });
  } catch (err) {
    next(err);
  }
};

const status = async (req, res, next) => {
  try {
    const { a, isDoctor } = await loadJoinable(req.params.appointmentId, req.user);
    if (!isDoctor) throw new NotFoundError('Appointment not found.');
    const admitted = !!a.video_admitted_at;
    res.json({ success: true, data: { admitted, patientWaiting: !admitted && !!a.patient_waiting } });
  } catch (err) {
    next(err);
  }
};

const admit = async (req, res, next) => {
  try {
    const { a, isDoctor } = await loadJoinable(req.params.appointmentId, req.user);
    if (!isDoctor) throw new NotFoundError('Appointment not found.');
    await db.query(
      "UPDATE appointments SET video_admitted_at = COALESCE(video_admitted_at, NOW()) WHERE id = ? AND status = 'pending'",
      [a.id]
    );
    res.json({ success: true, message: 'Patient admitted.' });
  } catch (err) {
    next(err);
  }
};

const complete = async (req, res, next) => {
  try {
    const a = await inTransaction((conn) => completeAppointment(conn, req.params.appointmentId, { role: 'doctor', userId: req.user.id }));
    await notifyUsers([a.patient_id], {
      type: 'teleconsult', title: 'Consultation completed',
      message: 'Your video consultation was marked completed by the doctor.', link: '/patient/history',
    });
    res.json({ success: true, message: 'Consultation marked completed.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { join, status, admit, complete };
