const db = require('../config/db');

// ─── GET /api/patient/profile ───────────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, gender, age, weight, phone, address, city, medical_history, role, created_at, guardian_name FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/patient/profile ───────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, gender, age, weight, address, city, medical_history, guardian_name } = req.body;

    await db.query(
      `UPDATE users
       SET name = COALESCE(?, name),
           phone = COALESCE(?, phone),
           gender = COALESCE(?, gender),
           age = COALESCE(?, age),
           weight = COALESCE(?, weight),
           address = COALESCE(?, address),
           city = COALESCE(?, city),
           medical_history = COALESCE(?, medical_history),
           guardian_name = COALESCE(?, guardian_name)
       WHERE id = ?`,
      [name, phone, gender, age, weight, address, city, medical_history, guardian_name, req.user.id]
    );

    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/patient/appointments ─────────────────────────────────────────
const getAppointments = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT
         a.id, a.status, a.created_at,
         ds.date, ds.time,
         u.name  AS doctor_name,
         d.specialization, d.fees,
         p.notes AS prescription_notes,
         p.file_url AS prescription_file,
         r.stars AS my_rating
       FROM appointments a
       JOIN doctor_slots ds ON a.slot_id  = ds.id
       JOIN doctors      d  ON a.doctor_id = d.id
       JOIN users        u  ON d.user_id   = u.id
       LEFT JOIN prescriptions p ON p.appointment_id = a.id
       LEFT JOIN ratings       r ON r.appointment_id = a.id
       WHERE a.patient_id = ?
       ORDER BY ds.date DESC, ds.time DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/patient/rate ────────────────────────────────────────────────
const submitRating = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { appointmentId, stars } = req.body;
    const patientId = req.user.id;

    // Validate input
    if (!appointmentId || !stars || stars < 1 || stars > 5) {
      return res.status(400).json({ success: false, message: 'appointmentId and stars (1-5) are required.' });
    }

    // Verify appointment belongs to this patient and is completed
    const [apptRows] = await conn.query(
      'SELECT id, doctor_id, status FROM appointments WHERE id = ? AND patient_id = ?',
      [appointmentId, patientId]
    );

    if (apptRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    if (apptRows[0].status !== 'completed') {
      return res.status(400).json({ success: false, message: 'You can only rate completed appointments.' });
    }

    const doctorId = apptRows[0].doctor_id;

    // Check for existing rating
    const [existingRating] = await conn.query(
      'SELECT id FROM ratings WHERE appointment_id = ?',
      [appointmentId]
    );

    if (existingRating.length > 0) {
      return res.status(409).json({ success: false, message: 'You have already rated this appointment.' });
    }

    await conn.beginTransaction();

    // Insert the rating
    await conn.query(
      'INSERT INTO ratings (appointment_id, doctor_id, patient_id, stars) VALUES (?, ?, ?, ?)',
      [appointmentId, doctorId, patientId, stars]
    );

    // Recalculate doctor average rating
    const [[avgResult]] = await conn.query(
      'SELECT AVG(stars) AS avg_rating, COUNT(*) AS total FROM ratings WHERE doctor_id = ?',
      [doctorId]
    );

    await conn.query(
      'UPDATE doctors SET rating = ?, rating_count = ? WHERE id = ?',
      [parseFloat(avgResult.avg_rating).toFixed(2), avgResult.total, doctorId]
    );

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Thank you for your feedback! ⭐',
      data: { stars, avgRating: parseFloat(avgResult.avg_rating).toFixed(1) },
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ─── GET /api/patient/medical-history ──────────────────────────────────────
const getMedicalHistory = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT
         p.id, p.notes, p.file_url, p.created_at,
         u.name AS doctor_name,
         d.specialization,
         ds.date, ds.time,
         a.status
       FROM prescriptions p
       JOIN doctors       d  ON p.doctor_id = d.id
       JOIN users         u  ON d.user_id   = u.id
       JOIN appointments  a  ON p.appointment_id = a.id
       JOIN doctor_slots  ds ON a.slot_id = ds.id
       WHERE p.patient_id = ?
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { getProfile, updateProfile, getAppointments, getMedicalHistory, submitRating };
