const db = require('../config/db');
const path = require('path');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
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
        a.id, a.status, a.created_at,
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
    const doctorId = await getDoctorId(req.user.id);
    const { appointmentId, status } = req.body;

    const [result] = await db.query(
      'UPDATE appointments SET status = ? WHERE id = ? AND doctor_id = ?',
      [status, appointmentId, doctorId]
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError('Appointment not found or not yours.');
    }

    res.json({ success: true, message: `Appointment status updated to "${status}".` });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/doctor/prescription ─────────────────────────────────────────
const createPrescription = async (req, res, next) => {
  try {
    const doctorId = await getDoctorId(req.user.id);
    const { appointmentId, patientId, notes } = req.body;

    // Verify appointment belongs to this doctor
    const [apptRows] = await db.query(
      'SELECT id FROM appointments WHERE id = ? AND doctor_id = ?',
      [appointmentId, doctorId]
    );
    if (apptRows.length === 0) {
      throw new ForbiddenError('Appointment not found or not yours.');
    }

    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Upsert prescription
    await db.query(
      `INSERT INTO prescriptions (appointment_id, doctor_id, patient_id, notes, file_url)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE notes = VALUES(notes), file_url = VALUES(file_url)`,
      [appointmentId, doctorId, patientId, notes || null, fileUrl]
    );

    // Mark appointment as completed
    await db.query(
      "UPDATE appointments SET status = 'completed' WHERE id = ?",
      [appointmentId]
    );

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
