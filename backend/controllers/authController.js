const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

// ─── Helper ────────────────────────────────────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ─── POST /api/auth/register ────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, gender, age, weight, address, city, guardian_name } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    // Check duplicate email
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Sanitise optional fields — empty strings from forms must become null for DECIMAL / INT / ENUM columns
    const parsedAge    = age !== undefined && age !== null && String(age).trim() !== '' ? Number(age) : null;
    const parsedWeight = weight !== undefined && weight !== null && String(weight).trim() !== '' ? Number(weight) : null;
    const safeAge      = parsedAge !== null && !isNaN(parsedAge) ? parsedAge : null;
    const safeWeight   = parsedWeight !== null && !isNaN(parsedWeight) ? parsedWeight : null;
    const safeGender   = gender && String(gender).trim() !== '' ? gender : null;

    // Insert patient (only patients can self-register)
    const [result] = await db.query(
      `INSERT INTO users (name, email, password, role, phone, gender, age, weight, address, city, guardian_name)
       VALUES (?, ?, ?, 'patient', ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hashed, phone || null, safeGender, safeAge, safeWeight, address || null, city || null, guardian_name || null]
    );

    const user = { id: result.insertId, email, role: 'patient' };
    const token = signToken(user);

    res.status(201).json({
      success: true,
      message: 'Registered successfully.',
      token,
      user: { id: result.insertId, name, email, role: 'patient' },
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/login ───────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = signToken(user);

    // Remove password before sending
    const { password: _pw, ...safeUser } = user;

    res.json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login };
