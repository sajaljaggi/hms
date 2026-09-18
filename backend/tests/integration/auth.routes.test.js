const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const redis = require('../../config/redis');

// Grabs the csrf_token cookie from a response and returns both the cookie
// header value and the header to echo back, matching what the frontend does.
function csrfFrom(res) {
  const setCookie = res.headers['set-cookie'] || [];
  const csrfCookie = setCookie.find((c) => c.startsWith('csrf_token='));
  const token = csrfCookie.split(';')[0].split('=')[1];
  return { cookie: csrfCookie.split(';')[0], header: token };
}

describe('POST /api/auth/register and /api/auth/login', () => {
  const email = `test-${Date.now()}@example.com`;
  const password = 'password123';

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE email = ?', [email]);
    await db.end();
    redis.disconnect();
  });

  test('register: creates a patient and sets auth cookies', async () => {
    const primer = await request(app).get('/api/health');
    const csrf = csrfFrom(primer);

    const res = await request(app)
      .post('/api/auth/register')
      .set('Cookie', csrf.cookie)
      .set('X-CSRF-Token', csrf.header)
      .send({ name: 'Test Patient', email, password });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toMatchObject({ email, role: 'patient' });
    expect(res.body.token).toBeUndefined(); // no token in the body — it's in the httpOnly cookie

    const setCookie = res.headers['set-cookie'].join(';');
    expect(setCookie).toMatch(/access_token=/);
    expect(setCookie).toMatch(/refresh_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  test('register: rejects a duplicate email with 409', async () => {
    const primer = await request(app).get('/api/health');
    const csrf = csrfFrom(primer);

    const res = await request(app)
      .post('/api/auth/register')
      .set('Cookie', csrf.cookie)
      .set('X-CSRF-Token', csrf.header)
      .send({ name: 'Test Patient', email, password });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  test('login: wrong password is rejected with 401 and no cookies are set', async () => {
    const primer = await request(app).get('/api/health');
    const csrf = csrfFrom(primer);

    const res = await request(app)
      .post('/api/auth/login')
      .set('Cookie', csrf.cookie)
      .set('X-CSRF-Token', csrf.header)
      .send({ email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('login: correct credentials succeed and GET /me confirms the session', async () => {
    const primer = await request(app).get('/api/health');
    const csrf = csrfFrom(primer);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Cookie', csrf.cookie)
      .set('X-CSRF-Token', csrf.header)
      .send({ email, password });

    expect(loginRes.status).toBe(200);
    const authCookies = loginRes.headers['set-cookie'].map((c) => c.split(';')[0]);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', authCookies.join('; '));

    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toMatchObject({ email, role: 'patient' });
  });

  test('protected route without any cookie: 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('state-changing request without a CSRF header: 403, even with valid cookies', async () => {
    const primer = await request(app).get('/api/health');
    const csrf = csrfFrom(primer);

    const res = await request(app)
      .post('/api/auth/login')
      .set('Cookie', csrf.cookie) // cookie present, header omitted
      .send({ email, password });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
