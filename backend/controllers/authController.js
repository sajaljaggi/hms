const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');
const { AuthError, ConflictError } = require('../utils/errors');

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

    // Check duplicate email
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      throw new ConflictError('Email already registered.');
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Insert patient (only patients can self-register)
    const [result] = await db.query(
      `INSERT INTO users (name, email, password, role, phone, gender, age, weight, address, city, guardian_name)
       VALUES (?, ?, ?, 'patient', ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hashed, phone ?? null, gender ?? null, age ?? null, weight ?? null, address ?? null, city ?? null, guardian_name ?? null]
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

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      throw new AuthError('Invalid credentials.');
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new AuthError('Invalid credentials.');
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
