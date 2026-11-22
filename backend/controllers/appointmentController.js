const crypto = require('crypto');
const db = require('../config/db');
const { generateSlotsForDoctorDate } = require('../utils/generateSlots');
const { AppError, NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { getCache, setCache, invalidateCache, availabilityKey } = require('../utils/cache');
const { toDateStr } = require('../utils/dates');
const { notifyBooking } = require('../services/notificationService');
const paymentGateway = require('../services/paymentGateway');

const MAX_UPCOMING_PER_PATIENT = 5;

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

    // A video visit can only be joined once paid, so it is unbookable while payments are off.
    if (isVideo && !paymentGateway.getMode()) {
      throw new AppError('Video consultations are unavailable because online payment is not configured. Please book an in-person visit.', 400, 'PAYMENT_NOT_CONFIGURED');
    }

    await conn.beginTransaction();

    // Lock the patient first so two parallel bookings by the same patient cannot both pass the limits below.
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [patientId]);

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

    // One patient must not be able to hoard the schedule.
    const [[limits]] = await conn.query(
      `SELECT COUNT(*) AS upcoming, COALESCE(SUM(a.doctor_id = ? AND ds.date = ?), 0) AS same_doctor_day
       FROM appointments a JOIN doctor_slots ds ON ds.id = a.slot_id
       WHERE a.patient_id = ? AND a.status = 'pending' AND TIMESTAMP(ds.date, ds.time) >= NOW()`,
      [doctorId, dateStr, patientId]
    );
    if (Number(limits.same_doctor_day) > 0) {
      throw new AppError('You already have an appointment with this doctor on that day.', 409, 'BOOKING_LIMIT');
    }
    if (Number(limits.upcoming) >= MAX_UPCOMING_PER_PATIENT) {
      throw new AppError(`You can have at most ${MAX_UPCOMING_PER_PATIENT} upcoming appointments. Cancel one to book another.`, 409, 'BOOKING_LIMIT');
    }

    // Mark slot as booked
    await conn.query('UPDATE doctor_slots SET is_booked = 1 WHERE id = ?', [slotId]);

    // Create appointment
    const [result] = await conn.query(
      `INSERT INTO appointments (patient_id, doctor_id, slot_id, active_slot_id, status, reason, consultation_type, video_room)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [patientId, doctorId, slotId, slotId, reason || null, consultationType, isVideo ? `hms-${crypto.randomBytes(16).toString('hex')}` : null]
    );

    await conn.commit();

    // The cached availability list for this doctor+date is now stale —
    // this slot just flipped from available to booked.
    await invalidateCache(availabilityKey(doctorId, dateStr));

    await notifyBooking({ patientId, doctorId, dateStr, time: slotRow.time, isVideo });

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
