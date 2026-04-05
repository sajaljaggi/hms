const db      = require('../config/db');
const bcrypt   = require('bcryptjs');

// ─── GET /api/admin/users ───────────────────────────────────────────────────
const getAllUsers = async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      `SELECT id, name, email, role, phone, city, created_at
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
      `SELECT d.id, u.name, u.email, d.specialization, d.fees, u.phone, u.created_at
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

module.exports = { getAllUsers, getAllDoctors, getAllAppointments, deleteUser, createDoctor };
