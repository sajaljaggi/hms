const db = require('../config/db');
const { AppError, NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { inTransaction } = require('../utils/transaction');
const { toDateStr, isWithinJoinWindow } = require('../utils/dates');
const { notifyUsers } = require('../services/notificationService');

// Patient owner or the appointment's doctor only; anyone else gets 404 so existence is not revealed.
const APPT_SQL = `SELECT a.id, a.patient_id, a.status, a.payment_status, a.consultation_type, a.video_room,
                         ds.date, ds.time, d.user_id AS doctor_user_id
                  FROM appointments a
                  JOIN doctor_slots ds ON a.slot_id = ds.id
                  JOIN doctors d ON a.doctor_id = d.id
                  WHERE a.id = ?`;

const join = async (req, res, next) => {
  try {
    const [rows] = await db.query(APPT_SQL, [req.params.appointmentId]);
    const a = rows[0];
    const isDoctor = a && a.doctor_user_id === req.user.id;
    const isPatient = a && a.patient_id === req.user.id;
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

    const [[u]] = await db.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
    res.json({
      success: true,
      data: {
        roomName: a.video_room,
        domain: process.env.JITSI_DOMAIN || 'meet.jit.si',
        displayName: u ? u.name : req.user.email,
        role: isDoctor ? 'doctor' : 'patient',
        startsAt,
        appointmentId: a.id,
      },
    });
  } catch (err) {
    next(err);
  }
};

const complete = async (req, res, next) => {
  try {
    const patientId = await inTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT a.patient_id, a.status, d.user_id AS doctor_user_id
         FROM appointments a JOIN doctors d ON a.doctor_id = d.id WHERE a.id = ? FOR UPDATE`,
        [req.params.appointmentId]
      );
      const a = rows[0];
      if (!a || a.doctor_user_id !== req.user.id) throw new NotFoundError('Appointment not found.');
      if (a.status !== 'pending') throw new ConflictError(`This appointment is already ${a.status}.`);
      await conn.query("UPDATE appointments SET status = 'completed' WHERE id = ?", [req.params.appointmentId]);
      return a.patient_id;
    });

    await notifyUsers([patientId], {
      type: 'teleconsult', title: 'Consultation completed',
      message: 'Your video consultation was marked completed by the doctor.', link: '/patient/history',
    });
    res.json({ success: true, message: 'Consultation marked completed.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { join, complete };
