const crypto = require('crypto');
const db = require('../config/db');
const { generateSlotsForDoctorDate } = require('../utils/generateSlots');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { getCache, setCache, invalidateCache, availabilityKey } = require('../utils/cache');
const { toDateStr } = require('../utils/dates');
const { notifyUsers } = require('../services/notificationService');

// ─── GET /api/doctors?specialization=xxx ───────────────────────────────────
const getDoctors = async (req, res, next) => {
  try {
    const { specialization } = req.query;

    let sql = `
      SELECT d.id, u.name, d.specialization, d.fees, d.profile_image, u.email
      FROM doctors d
      JOIN users u ON d.user_id = u.id
    `;
    const params = [];

    if (specialization) {
      sql += ' WHERE d.specialization = ?';
      params.push(specialization);
    }

    sql += ' ORDER BY u.name ASC';

    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/slots?doctorId=&date= ─────────────────────────────────────────
const getAvailableSlots = async (req, res, next) => {
  try {
    const { doctorId, date } = req.query;
    const cacheKey = availabilityKey(doctorId, date);

    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, cached: true });
    }

    // Auto-generate slots for this doctor+date if not yet created
    await generateSlotsForDoctorDate(doctorId, date);

    // Return ALL slots for the day (booked + blocked + available)
    const [rows] = await db.query(
      `SELECT id, date, time, is_booked, is_available
       FROM doctor_slots
       WHERE doctor_id = ? AND date = ?
       ORDER BY time ASC`,
      [doctorId, date]
    );

    await setCache(cacheKey, rows);
    res.json({ success: true, data: rows, cached: false });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/appointments/book ────────────────────────────────────────────
const bookAppointment = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { doctorId, slotId, reason, consultationType = 'in_person' } = req.body;
    const isVideo = consultationType === 'video';
    const patientId = req.user.id;

    await conn.beginTransaction();

    // Lock the slot row to prevent race conditions (double-booking)
    const [slotRows] = await conn.query(
      'SELECT id, date, time, is_booked, is_available FROM doctor_slots WHERE id = ? AND doctor_id = ? FOR UPDATE',
      [slotId, doctorId]
    );

    if (slotRows.length === 0) {
      throw new NotFoundError('Slot not found.');
    }

    if (slotRows[0].is_booked) {
      throw new ConflictError('This slot is already booked. Please choose another.');
    }

    if (!slotRows[0].is_available) {
      throw new ValidationError('This slot has been blocked by the administrator.');
    }

    // Reject if slot date+time is already in the past
    const slotRow = slotRows[0];
    const dateStr = toDateStr(slotRow.date);
    const slotDateTime = new Date(`${dateStr}T${slotRow.time}`);
    if (slotDateTime < new Date()) {
      throw new ValidationError('This time slot has already passed and can no longer be booked.');
    }

    // Mark slot as booked
    await conn.query('UPDATE doctor_slots SET is_booked = 1 WHERE id = ?', [slotId]);

    // Create appointment
    const [result] = await conn.query(
      `INSERT INTO appointments (patient_id, doctor_id, slot_id, status, reason, consultation_type, video_room)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
      [patientId, doctorId, slotId, reason || null, consultationType, isVideo ? `hms-${crypto.randomBytes(16).toString('hex')}` : null]
    );

    await conn.commit();

    // The cached availability list for this doctor+date is now stale —
    // this slot just flipped from available to booked.
    await invalidateCache(availabilityKey(doctorId, dateStr));

    // Best-effort: a failed lookup or notification must not fail a committed booking.
    try {
      const [[doc]] = await db.query('SELECT user_id FROM doctors WHERE id = ?', [doctorId]);
      const when = `${dateStr} ${String(slotRow.time).slice(0, 5)}`;
      const kind = isVideo ? 'video ' : '';
      await notifyUsers([patientId], {
        type: 'appointment', title: 'Appointment booked',
        message: `Your ${kind}appointment on ${when} was booked.`, link: '/patient/history',
      });
      await notifyUsers([doc && doc.user_id], {
        type: 'appointment', title: 'New appointment',
        message: `A patient booked a ${kind}appointment on ${when}.`, link: '/doctor/appointments',
      });
    } catch (notifyErr) {
      console.error('booking notification failed:', notifyErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully.',
      appointmentId: result.insertId,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

module.exports = { getDoctors, getAvailableSlots, bookAppointment };
