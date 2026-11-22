const db = require('../config/db');
const { NotFoundError, ForbiddenError, ConflictError } = require('../utils/errors');
const { inTransaction } = require('../utils/transaction');
const { completeAppointment, cancelAppointment, afterCancel } = require('../services/appointmentService');
const { invalidateCache, availabilityKey } = require('../utils/cache');

// Helper: get doctor row from logged-in user
const getDoctorId = async (userId) => {
  const [rows] = await db.query('SELECT id FROM doctors WHERE user_id = ?', [userId]);
  if (rows.length === 0) throw new NotFoundError('Doctor profile not found.');
  return rows[0].id;
};

// ─── GET /api/doctor/appointments ──────────────────────────────────────────
const getAppointments = async (req, res, next) => {
  try {
    const doctorId = await getDoctorId(req.user.id);

    let sql = `
      SELECT
        a.id, a.status, a.payment_status, a.consultation_type, a.created_at,
        ds.date, ds.time,
        u.id   AS patient_id,
        u.name AS patient_name,
        u.email AS patient_email,
        u.phone AS patient_phone,
        u.age, u.gender
      FROM appointments a
      JOIN doctor_slots ds ON a.slot_id    = ds.id
      JOIN users        u  ON a.patient_id = u.id
      WHERE a.doctor_id = ?
    `;
    const params = [doctorId];

    // Search filters
    if (req.query.date) {
      sql += ' AND ds.date = ?';
      params.push(req.query.date);
    }
    if (req.query.patient) {
      sql += ' AND u.name LIKE ?';
      params.push(`%${req.query.patient}%`);
    }

    sql += ' ORDER BY ds.date ASC, ds.time ASC';

    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/doctor/appointment-status ────────────────────────────────────
const updateAppointmentStatus = async (req, res, next) => {
  try {
    const { appointmentId, status } = req.body;
    const actor = { role: 'doctor', userId: req.user.id };
    const change = status === 'cancelled' ? cancelAppointment : completeAppointment;
    const a = await inTransaction((conn) => change(conn, appointmentId, actor));
    if (status === 'cancelled') await afterCancel(a, actor);
    res.json({ success: true, message: `Appointment status updated to "${status}".` });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/doctor/prescription ─────────────────────────────────────────
// Saves or edits the prescription for one of this doctor's visits and completes the visit.
// The patient always comes from the appointment, never from the request.
const createPrescription = async (req, res, next) => {
  try {
    const doctorId = await getDoctorId(req.user.id);
    const { appointmentId, notes } = req.body;

    const fileUrl = await inTransaction(async (conn) => {
      const [[appt]] = await conn.query(
        'SELECT id, patient_id, status FROM appointments WHERE id = ? AND doctor_id = ? FOR UPDATE',
        [appointmentId, doctorId]
      );
      if (!appt) throw new ForbiddenError('Appointment not found or not yours.');
      if (appt.status === 'cancelled') throw new ConflictError('This appointment was cancelled.');

      await conn.query(
        `INSERT INTO prescriptions (appointment_id, doctor_id, patient_id, notes)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE notes = VALUES(notes)`,
        [appointmentId, doctorId, appt.patient_id, notes || null]
      );
      const [[p]] = await conn.query('SELECT id, file_url FROM prescriptions WHERE appointment_id = ?', [appointmentId]);
      if (appt.status === 'pending') await conn.query("UPDATE appointments SET status = 'completed' WHERE id = ?", [appointmentId]);

      // A save without a file keeps the earlier file.
      if (!req.upload) return p.file_url;
      const { mime, name, buffer } = req.upload;
      await conn.query(
        `INSERT INTO prescription_files (prescription_id, mime, name, size_bytes, data) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE mime = VALUES(mime), name = VALUES(name), size_bytes = VALUES(size_bytes), data = VALUES(data)`,
        [p.id, mime, name, buffer.length, buffer]
      );
      const url = `/api/files/prescriptions/${p.id}`;
      await conn.query('UPDATE prescriptions SET file_url = ? WHERE id = ?', [url, p.id]);
      return url;
    });

    res.status(201).json({ success: true, message: 'Prescription saved and appointment marked completed.', fileUrl });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/doctor/slots ─────────────────────────────────────────────────
const createSlots = async (req, res, next) => {
  try {
    const doctorId = await getDoctorId(req.user.id);
    const { slots } = req.body; // [{ date, time }]

    const values = slots.map(({ date, time }) => [doctorId, date, time]);

    await db.query(
      'INSERT IGNORE INTO doctor_slots (doctor_id, date, time) VALUES ?',
      [values]
    );

    const uniqueDates = [...new Set(slots.map((s) => s.date))];
    await Promise.all(uniqueDates.map((date) => invalidateCache(availabilityKey(doctorId, date))));

    res.status(201).json({ success: true, message: `${slots.length} slot(s) created.` });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/doctor/dashboard ──────────────────────────────────────────────
const getDashboardStats = async (req, res, next) => {
  try {
    const doctorId = await getDoctorId(req.user.id);

    // 1. Total Patients (Unique)
    const [patientRows] = await db.query(
      'SELECT COUNT(DISTINCT patient_id) as total FROM appointments WHERE doctor_id = ?',
      [doctorId]
    );

    // 2. Upcoming Appointments (Pending & Future)
    const [upcomingRows] = await db.query(
      `SELECT COUNT(*) as total 
       FROM appointments a 
       JOIN doctor_slots ds ON a.slot_id = ds.id 
       WHERE a.doctor_id = ? AND a.status = 'pending'
       AND (ds.date > CURRENT_DATE OR (ds.date = CURRENT_DATE AND ds.time >= CURRENT_TIME))`,
      [doctorId]
    );

    // 3. Pending Prescriptions (Finished appointments without prescription)
    // We consider it "pending" if the slot time has passed but no prescription exists
    const [pendingPresRow] = await db.query(
      `SELECT COUNT(*) as total 
       FROM appointments a 
       JOIN doctor_slots ds ON a.slot_id = ds.id 
       LEFT JOIN prescriptions p ON a.id = p.appointment_id 
       WHERE a.doctor_id = ? AND a.status != 'cancelled'
       AND (ds.date < CURRENT_DATE OR (ds.date = CURRENT_DATE AND ds.time < CURRENT_TIME))
       AND p.id IS NULL`,
      [doctorId]
    );

    // 4. Schedule for Next 2 Days (Today & Tomorrow)
    const [scheduleRows] = await db.query(
      `SELECT 
         a.id, a.status, a.reason,
         ds.date, ds.time,
         u.name AS patient_name
       FROM appointments a
       JOIN doctor_slots ds ON a.slot_id = ds.id
       JOIN users u ON a.patient_id = u.id
       WHERE a.doctor_id = ?
       AND ds.date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY)
       ORDER BY ds.date ASC, ds.time ASC`,
      [doctorId]
    );

    res.json({
      success: true,
      data: {
        totalPatients: patientRows[0].total,
        upcomingAppointments: upcomingRows[0].total,
        pendingPrescriptions: pendingPresRow[0].total,
        schedule: scheduleRows
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAppointments, updateAppointmentStatus, createPrescription, createSlots, getDashboardStats };
