const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const { createUserSession, authed, cleanupUsers } = require('../helpers/session');
const { notifyUsers } = require('../../services/notificationService');

describe('notifications routes', () => {
  let a, b;
  const ids = [];

  beforeAll(async () => {
    a = await createUserSession('patient');
    b = await createUserSession('patient');
    ids.push(a.userId, b.userId);
  });
  afterAll(async () => {
    await cleanupUsers(ids);
  });

  test('unauthenticated -> 401', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  test('list is newest first, scoped to the user, with unreadCount, limit and unreadOnly', async () => {
    for (const title of ['n1', 'n2', 'n3']) {
      await notifyUsers([a.userId], { type: 'system', title, message: 'm' });
    }
    await notifyUsers([b.userId], { type: 'system', title: 'other', message: 'm' });

    const res = await authed(request(app).get, '/api/notifications', a);
    expect(res.status).toBe(200);
    expect(res.body.data.map((n) => n.title)).toEqual(['n3', 'n2', 'n1']);
    expect(res.body.unreadCount).toBe(3);

    const limited = await authed(request(app).get, '/api/notifications?limit=2', a);
    expect(limited.body.data).toHaveLength(2);

    const bad = await authed(request(app).get, '/api/notifications?limit=500', a);
    expect(bad.status).toBe(400);
  });

  test('mark read, unreadOnly filter, and another user\'s notification -> 404', async () => {
    const list = await authed(request(app).get, '/api/notifications', a);
    const [first, second] = list.body.data;

    const mine = await authed(request(app).patch, `/api/notifications/${first.id}/read`, a);
    expect(mine.body).toEqual({ success: true });

    const [[other]] = await db.query('SELECT id FROM notifications WHERE user_id = ?', [b.userId]);
    const foreign = await authed(request(app).patch, `/api/notifications/${other.id}/read`, a);
    expect(foreign.status).toBe(404);

    const unread = await authed(request(app).get, '/api/notifications?unreadOnly=true', a);
    expect(unread.body.data.map((n) => n.id)).not.toContain(first.id);
    expect(unread.body.data.map((n) => n.id)).toContain(second.id);
    expect(unread.body.unreadCount).toBe(2);
  });

  test('read-all marks the rest and reports the count', async () => {
    const res = await authed(request(app).patch, '/api/notifications/read-all', a);
    expect(res.body).toEqual({ success: true, updated: 2 });
    const after = await authed(request(app).get, '/api/notifications', a);
    expect(after.body.unreadCount).toBe(0);
    // b's notification untouched
    const [[row]] = await db.query('SELECT is_read FROM notifications WHERE user_id = ?', [b.userId]);
    expect(row.is_read).toBe(0);
  });
});

describe('booking creates notifications', () => {
  test('patient and doctor are both notified', async () => {
    const patient = await createUserSession('patient');
    const doctor = await createUserSession('doctor');
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const [slot] = await db.query(
      'INSERT INTO doctor_slots (doctor_id, date, time, is_booked, is_available) VALUES (?, ?, ?, 0, 1)',
      [doctor.doctorId, d.toISOString().split('T')[0], '09:00:00']
    );
    try {
      const res = await authed(request(app).post, '/api/appointments/book', patient)
        .send({ doctorId: doctor.doctorId, slotId: slot.insertId });
      expect(res.status).toBe(201);

      const p = await authed(request(app).get, '/api/notifications', patient);
      expect(p.body.data[0]).toMatchObject({ title: 'Appointment booked', type: 'appointment', link: '/patient/history' });
      const dr = await authed(request(app).get, '/api/notifications', doctor);
      expect(dr.body.data[0]).toMatchObject({ title: 'New appointment', link: '/doctor/appointments' });
    } finally {
      await cleanupUsers([patient.userId, doctor.userId]);
    }
  });
});

afterAll(async () => {
  await db.end();
});
