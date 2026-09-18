const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');
const { AuthError, ConflictError, NotFoundError } = require('../utils/errors');
const {
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE,
  ACCESS_TOKEN_TTL_MIN,
  REFRESH_TOKEN_TTL_DAYS,
} = require('../utils/cookies');

// ─── Helpers ───────────────────────────────────────────────────────────────
const signAccessToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: `${ACCESS_TOKEN_TTL_MIN}m` }
  );

// Signed with a separate secret and carries no email/role — if it's ever
// misused as an access token, verifying it against JWT_SECRET fails outright.
const signRefreshToken = (user) =>
  jwt.sign(
    { id: user.id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` }
  );

const issueSession = (res, user) => {
  setAuthCookies(res, {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  });
};

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
    issueSession(res, user);

    res.status(201).json({
      success: true,
      message: 'Registered successfully.',
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

    issueSession(res, user);

    // Remove password before sending
    const { password: _pw, ...safeUser } = user;

    res.json({
      success: true,
      message: 'Logged in successfully.',
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/refresh ─────────────────────────────────────────────────
// Reads the httpOnly refresh_token cookie and, if valid, issues a fresh
// access token (and rotates the refresh token). No server-side token store
// exists, so a stolen refresh token can't be revoked before it expires —
// that's the tradeoff for keeping this stateless; it's why the refresh
// token still gets a real (if longer) expiry instead of living forever.
const refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      throw new AuthError('No refresh token provided.');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      throw new AuthError('Invalid or expired refresh token.');
    }
    if (decoded.type !== 'refresh') {
      throw new AuthError('Invalid token type.');
    }

    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (rows.length === 0) {
      throw new NotFoundError('User no longer exists.');
    }

    const user = rows[0];
    issueSession(res, user);

    const { password: _pw, ...safeUser } = user;
    res.json({ success: true, message: 'Session refreshed.', user: safeUser });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/logout ──────────────────────────────────────────────────
const logout = (req, res) => {
  clearAuthCookies(res);
  res.json({ success: true, message: 'Logged out successfully.' });
};

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
// Lets the frontend confirm/restore the session on load without ever
// reading the (httpOnly, JS-inaccessible) token itself.
const me = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      throw new NotFoundError('User not found.');
    }
    const { password: _pw, ...safeUser } = rows[0];
    res.json({ success: true, user: safeUser });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refresh, logout, me };
