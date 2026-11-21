const request = require('supertest');
const app = require('../../app');
const db = require('../../config/db');
const { createUserSession, authed, cleanupUsers } = require('../helpers/session');

describe('navigation routes', () => {
  let admin, patient, ids, created = [];
  const idOf = async (code) => (await db.query('SELECT id FROM nav_locations WHERE code = ?', [code]))[0][0].id;
  const code = () => `T_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

  beforeAll(async () => {
    admin = await createUserSession('admin');
    patient = await createUserSession('patient');
    ids = [admin.userId, patient.userId];
  });
  afterAll(async () => {
    if (created.length) await db.query('DELETE FROM nav_locations WHERE id IN (?)', [created]);
    await cleanupUsers(ids);
  });

  it('lists and filters locations publicly', async () => {
    const all = await request(app).get('/api/navigation/locations');
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBeGreaterThanOrEqual(20);
    const lifts = await request(app).get('/api/navigation/locations?category=elevator');
    expect(lifts.body.data.every((l) => l.category === 'elevator')).toBe(true);
    const q = await request(app).get('/api/navigation/locations?q=neuro');
    expect(q.body.data.map((l) => l.code)).toEqual(['NEUROLOGY']);
    const wild = await request(app).get('/api/navigation/locations?q=%25');
    expect(wild.body.data).toEqual([]);
  });

  it('default route uses stairs, accessible route uses the lift', async () => {
    const from = await idOf('MAIN_ENTRANCE');
    const to = await idOf('NEUROLOGY');
    const def = await request(app).get(`/api/navigation/route?from=${from}&to=${to}`);
    const acc = await request(app).get(`/api/navigation/route?from=${from}&to=${to}&accessible=true`);
    expect(def.status).toBe(200);
    expect(acc.status).toBe(200);
    const codes = (r) => r.body.data.steps.flatMap((s) => [s.from.code, s.to.code]);
    expect(codes(def).some((c) => c.startsWith('STAIRS'))).toBe(true);
    expect(codes(acc).some((c) => c.startsWith('STAIRS'))).toBe(false);
    expect(codes(acc)).toContain('LIFT_2');
    expect(acc.body.data.totalDistance).toBeGreaterThan(def.body.data.totalDistance);
    expect(def.body.data.estimatedMinutes).toBe(Math.ceil(def.body.data.totalDistance / 70));
    expect(def.body.data.steps[0].from.name).toBe('Main Entrance');
  });

  it('404s for an unknown location and for no route', async () => {
    const from = await idOf('MAIN_ENTRANCE');
    expect((await request(app).get(`/api/navigation/route?from=${from}&to=999999`)).status).toBe(404);
    const [r] = await db.query("INSERT INTO nav_locations (code, name, category, floor) VALUES (?, 'Island', 'facility', 0)", [code()]);
    created.push(r.insertId);
    const res = await request(app).get(`/api/navigation/route?from=${from}&to=${r.insertId}`);
    expect(res.status).toBe(404);
    expect(res.body.message || res.body.error).toMatch(/No route/);
  });

  it('admin creates and deletes locations and edges', async () => {
    const a = await authed(request(app).post, '/api/navigation/locations', admin)
      .send({ code: code(), name: 'Test A', category: 'facility', floor: 1 });
    const b = await authed(request(app).post, '/api/navigation/locations', admin)
      .send({ code: code(), name: 'Test B', category: 'facility', floor: 1 });
    expect(a.status).toBe(201);
    created.push(a.body.data.id, b.body.data.id);
    const edge = { fromLocationId: a.body.data.id, toLocationId: b.body.data.id, distanceM: 70, instruction: 'Go to B', reverseInstruction: 'Go to A' };
    const e = await authed(request(app).post, '/api/navigation/edges', admin).send(edge);
    expect(e.status).toBe(201);
    const route = await request(app).get(`/api/navigation/route?from=${b.body.data.id}&to=${a.body.data.id}`);
    expect(route.body.data.steps[0].instruction).toBe('Go to A');
    expect(route.body.data.estimatedMinutes).toBe(1);
    expect((await authed(request(app).post, '/api/navigation/edges', admin).send({ ...edge, toLocationId: edge.fromLocationId })).status).toBe(400);
    expect((await authed(request(app).post, '/api/navigation/edges', admin).send({ ...edge, toLocationId: 999999 })).status).toBe(400);
    expect((await authed(request(app).delete, `/api/navigation/edges/${e.body.data.id}`, admin)).status).toBe(200);
    expect((await authed(request(app).delete, `/api/navigation/edges/${e.body.data.id}`, admin)).status).toBe(404);
    expect((await authed(request(app).delete, `/api/navigation/locations/${a.body.data.id}`, admin)).status).toBe(200);
    expect((await authed(request(app).delete, `/api/navigation/locations/${a.body.data.id}`, admin)).status).toBe(404);
  });

  it('forbids a patient from creating a location', async () => {
    const res = await authed(request(app).post, '/api/navigation/locations', patient)
      .send({ code: code(), name: 'Nope', category: 'facility', floor: 0 });
    expect(res.status).toBe(403);
  });
});
