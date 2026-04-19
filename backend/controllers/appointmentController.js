const db = require('../config/db');
const { generateSlotsForDoctorDate, generateSlotsForAllDoctors } = require('../utils/generateSlots');

// ─── GET /api/doctors?specialization=xxx ───────────────────────────────────
const getDoctors = async (req, res, next) => {
  try {
    const { specialization } = req.query;

    let sql = `
      SELECT d.id, u.name, d.specialization, d.fees, u.email
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

    if (!doctorId || !date) {
      return res.status(400).json({ success: false, message: 'doctorId and date are required.' });
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

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/appointments/book ────────────────────────────────────────────
const bookAppointment = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { doctorId, slotId, reason } = req.body;
    const patientId = req.user.id;

    if (!doctorId || !slotId) {
      return res.status(400).json({ success: false, message: 'doctorId and slotId are required.' });
    }

    await conn.beginTransaction();

    // Lock the slot row to prevent race conditions (double-booking)
    const [slotRows] = await conn.query(
      'SELECT id, date, time, is_booked, is_available FROM doctor_slots WHERE id = ? AND doctor_id = ? FOR UPDATE',
      [slotId, doctorId]
    );

    if (slotRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Slot not found.' });
    }

    if (slotRows[0].is_booked) {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'This slot is already booked. Please choose another.' });
    }

    if (!slotRows[0].is_available) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'This slot has been blocked by the administrator.' });
    }

    // Reject if slot date+time is already in the past
    const slotRow = slotRows[0];
    const dateStr = slotRow.date instanceof Date
      ? slotRow.date.toISOString().split('T')[0]
      : String(slotRow.date);
    const slotDateTime = new Date(`${dateStr}T${slotRow.time}`);
    if (slotDateTime < new Date()) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'This time slot has already passed and can no longer be booked.' });
    }

    // Mark slot as booked
    await conn.query('UPDATE doctor_slots SET is_booked = 1 WHERE id = ?', [slotId]);

    // Create appointment
    const [result] = await conn.query(
      `INSERT INTO appointments (patient_id, doctor_id, slot_id, status, reason)
       VALUES (?, ?, ?, 'pending', ?)`,
      [patientId, doctorId, slotId, reason || null]
    );

    await conn.commit();

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
