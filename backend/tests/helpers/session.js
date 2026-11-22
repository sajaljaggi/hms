const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../app');
const db = require('../../config/db');
const redis = require('../../config/redis');

const PASSWORD = 'password123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
let seq = 0;

function csrfFrom(res) {
  const setCookie = res.headers['set-cookie'] || [];
  const csrfCookie = setCookie.find((c) => c.startsWith('csrf_token='));
  if (!csrfCookie) throw new Error('csrfFrom: response has no csrf_token cookie');
  const cookie = csrfCookie.split(';')[0];
  return { cookie, header: cookie.split('=')[1] };
}

// Inserts a user (and a doctors row for role 'doctor') directly, then logs in
// through the real endpoint. Each login uses a unique X-Forwarded-For (the app
// trusts one proxy hop) so the IP-keyed auth rate limiter never trips.
async function createUserSession(role, overrides = {}) {
  seq += 1;
  const email = overrides.email || `${role}-${Date.now()}-${seq}-${Math.random().toString(36).slice(2)}@example.com`;
  const [u] = await db.query(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    [overrides.name || `Test ${role}`, email, PASSWORD_HASH, role]
  );
  const session = { userId: u.insertId, email };
  if (role === 'doctor') {
    const [d] = await db.query(
      'INSERT INTO doctors (user_id, specialization, fees) VALUES (?, ?, ?)',
      [u.insertId, overrides.specialization || 'General Medicine', overrides.fees ?? 500]
    );
    session.doctorId = d.insertId;
  }

  const csrf = csrfFrom(await request(app).get('/api/health'));
  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', `10.${seq % 250}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
    .set('Cookie', csrf.cookie)
    .set('X-CSRF-Token', csrf.header)
    .send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`test login failed: ${res.status} ${JSON.stringify(res.body)}`);

  const authCookies = res.headers['set-cookie'].map((c) => c.split(';')[0]);
  return { ...session, cookies: [...authCookies, csrf.cookie].join('; '), csrfToken: csrf.header };
}

// authed(request(app).post, '/api/x', session) -> supertest Test with auth headers set
function authed(agentMethod, url, session) {
  return agentMethod(url).set('Cookie', session.cookies).set('X-CSRF-Token', session.csrfToken);
}

// Deleting users cascades to doctors, notifications, appointments, etc.
async function cleanupUsers(ids) {
  const list = (ids || []).filter(Boolean);
  if (list.length) await db.query('DELETE FROM users WHERE id IN (?)', [list]);
}

// Call from a file's last top-level afterAll: an open DB pool or a Redis client
// retrying its connection keeps Jest from exiting after the run.
async function closeTestConnections() {
  await db.end();
  redis.disconnect();
}

module.exports = { csrfFrom, createUserSession, authed, cleanupUsers, closeTestConnections, PASSWORD };
