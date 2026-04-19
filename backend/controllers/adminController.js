const db      = require('../config/db');
const bcrypt   = require('bcryptjs');
const { generateSlotsForDoctorDate, generateSlotsForAllDoctors } = require('../utils/generateSlots');

// ─── GET /api/admin/users ───────────────────────────────────────────────────
const getAllUsers = async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      `SELECT id, name, email, role, phone, city, age, gender, address, guardian_name, medical_history, created_at
       FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM users');

    res.json({ success: true, total, page, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/doctors ─────────────────────────────────────────────────
const getAllDoctors = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.id, u.id AS user_id, u.name, u.email, d.specialization, d.fees, d.rating, d.rating_count, u.phone, u.created_at
       FROM doctors d
       JOIN users u ON d.user_id = u.id
       ORDER BY u.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/appointments ─────────────────────────────────────────────
const getAllAppointments = async (req, res, next) => {
  try {
    let sql = `
      SELECT
        a.id, a.status, a.created_at,
        ds.date, ds.time,
        pu.name  AS patient_name,
        pu.email AS patient_email,
        du.name  AS doctor_name,
        d.specialization, d.fees
      FROM appointments a
      JOIN doctor_slots ds ON a.slot_id    = ds.id
      JOIN users        pu ON a.patient_id = pu.id
      JOIN doctors      d  ON a.doctor_id  = d.id
      JOIN users        du ON d.user_id    = du.id
    `;
    const params = [];

    if (req.query.status) {
      sql += ' WHERE a.status = ?';
      params.push(req.query.status);
    }

    sql += ' ORDER BY a.created_at DESC';

    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/admin/user/:id ─────────────────────────────────────────────
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Prevent deleting own account
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, message: "Cannot delete your own account." });
    }

    const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/admin/doctor ─────────────────────────────────────────────────
const createDoctor = async (req, res, next) => {
  try {
    const { name, email, password, specialization, fees, phone } = req.body;
    if (!name || !email || !password || !specialization || !fees) {
      return res.status(400).json({ success: false, message: 'name, email, password, specialization and fees are required.' });
    }

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);

    const [userResult] = await db.query(
      "INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, 'doctor', ?)",
      [name, email, hashed, phone || null]
    );

    await db.query(
      'INSERT INTO doctors (user_id, specialization, fees) VALUES (?, ?, ?)',
      [userResult.insertId, specialization, fees]
    );

    res.status(201).json({ success: true, message: 'Doctor account created successfully.' });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/slots?doctorId=&date= ──────────────────────────────────
const getAdminSlots = async (req, res, next) => {
  try {
    const { doctorId, date } = req.query;
    if (!doctorId || !date) {
      return res.status(400).json({ success: false, message: 'doctorId and date are required.' });
    }
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

// ─── PATCH /api/admin/slots/:slotId/toggle ──────────────────────────────────
const toggleSlot = async (req, res, next) => {
  try {
    const { slotId } = req.params;
    const [rows] = await db.query(
      'SELECT id, is_booked, is_available FROM doctor_slots WHERE id = ?',
      [slotId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Slot not found.' });
    }
    if (rows[0].is_booked) {
      return res.status(400).json({ success: false, message: 'Cannot modify a booked slot.' });
    }
    const newAvailable = rows[0].is_available ? 0 : 1;
    await db.query('UPDATE doctor_slots SET is_available = ? WHERE id = ?', [newAvailable, slotId]);
    res.json({ success: true, is_available: newAvailable });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/admin/slots/day ────────────────────────────────────────────
const blockDay = async (req, res, next) => {
  try {
    const { doctorId, date } = req.body;
    if (!doctorId || !date) {
      return res.status(400).json({ success: false, message: 'doctorId and date are required.' });
    }
    const [result] = await db.query(
      'DELETE FROM doctor_slots WHERE doctor_id = ? AND date = ? AND is_booked = 0',
      [doctorId, date]
    );
    res.json({ success: true, deleted: result.affectedRows });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/admin/slots/generate ─────────────────────────────────────────
const generateSlotsAdmin = async (req, res, next) => {
  try {
    const { doctorId, date } = req.body;
    if (!date) {
      return res.status(400).json({ success: false, message: 'date is required.' });
    }
    if (doctorId) {
      await generateSlotsForDoctorDate(doctorId, date);
    } else {
      await generateSlotsForAllDoctors(date);
    }
    res.json({ success: true, message: 'Slots generated successfully.' });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/admin/users/:id ─────────────────────────────────────────────
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, city, address } = req.body;
    await db.query(
      'UPDATE users SET name=?, phone=?, city=?, address=? WHERE id=?',
      [name, phone || null, city || null, address || null, id]
    );
    res.json({ success: true, message: 'Patient updated.' });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/admin/doctors/:id ──────────────────────────────────────────
const updateDoctor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, specialization, fees } = req.body;
    const [[doctor]] = await db.query('SELECT user_id FROM doctors WHERE id=?', [id]);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found.' });
    await db.query('UPDATE users SET name=?, phone=? WHERE id=?', [name, phone || null, doctor.user_id]);
    await db.query('UPDATE doctors SET specialization=?, fees=? WHERE id=?', [specialization, fees, id]);
    res.json({ success: true, message: 'Doctor updated.' });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/admin/appointments/:id ────────────────────────────────────
const deleteAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const conn = await db.getConnection();
    await conn.beginTransaction();
    const [[appt]] = await conn.query('SELECT slot_id FROM appointments WHERE id=?', [id]);
    if (!appt) { await conn.rollback(); conn.release(); return res.status(404).json({ success: false, message: 'Appointment not found.' }); }
    await conn.query('DELETE FROM appointments WHERE id=?', [id]);
    await conn.query('UPDATE doctor_slots SET is_booked=0 WHERE id=?', [appt.slot_id]);
    await conn.commit();
    conn.release();
    res.json({ success: true, message: 'Appointment deleted and slot freed.' });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/admin/appointments/:id ────────────────────────────────────
const updateAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['pending', 'completed', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
    await db.query('UPDATE appointments SET status=? WHERE id=?', [status, id]);
    res.json({ success: true, message: 'Appointment status updated.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAllUsers, getAllDoctors, getAllAppointments, deleteUser, createDoctor, getAdminSlots, toggleSlot, blockDay, generateSlotsAdmin, updateUser, updateDoctor, deleteAppointment, updateAppointment };
