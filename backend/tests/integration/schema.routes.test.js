const mysql = require('mysql2/promise');
const db = require('../../config/db');
const { applySchema } = require('../../database/applySchema');

afterAll(() => db.end());

test('pool connections run in the +05:30 session zone (matches TZ=Asia/Kolkata)', async () => {
  const [[row]] = await db.query('SELECT @@session.time_zone AS tz');
  expect(row.tz).toBe('+05:30');
});

test('a fresh database gets every seed row (3 wards, 22 beds, 20 locations, 24 edges)', async () => {
  const name = `${process.env.DB_NAME}_seedcheck`;
  expect(name).toContain('test'); // this test drops the database it creates
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;
  const opts = { host: DB_HOST, port: DB_PORT ? Number(DB_PORT) : undefined, user: DB_USER, password: DB_PASSWORD };
  const root = await mysql.createConnection(opts);
  await root.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await root.query(`CREATE DATABASE \`${name}\``);
  const conn = await mysql.createConnection({ ...opts, database: name });
  try {
    await applySchema(conn);
    const [[c]] = await conn.query(`SELECT
      (SELECT COUNT(*) FROM wards) wards, (SELECT COUNT(*) FROM beds) beds,
      (SELECT COUNT(*) FROM nav_locations) locs, (SELECT COUNT(*) FROM nav_edges) edges`);
    expect(c).toEqual({ wards: 3, beds: 22, locs: 20, edges: 24 });
    const [beds] = await conn.query(`SELECT w.name, b.bed_number, b.daily_rate FROM beds b JOIN wards w ON w.id = b.ward_id
      WHERE b.bed_number IN ('GA-01', 'GA-10', 'ICU-06', 'ER-06') ORDER BY b.bed_number`);
    expect(beds.map((b) => [b.name, b.bed_number, Number(b.daily_rate)])).toEqual([
      ['Emergency Bay', 'ER-06', 2500], ['General Ward A', 'GA-01', 1500], ['General Ward A', 'GA-10', 1500], ['ICU', 'ICU-06', 6000],
    ]);
    const [[edge]] = await conn.query(`SELECT e.distance_m, e.accessible, e.instruction FROM nav_edges e
      JOIN nav_locations f ON f.id = e.from_location_id JOIN nav_locations t ON t.id = e.to_location_id
      WHERE f.code = 'JUNCTION_G' AND t.code = 'STAIRS_G'`);
    expect(edge).toEqual({ distance_m: 10, accessible: 0, instruction: 'Take the short passage to the staircase' });
  } finally {
    await conn.end();
    await root.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await root.end();
  }
});
