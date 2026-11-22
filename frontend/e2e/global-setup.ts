import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { E2EFixtures } from './helpers';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../backend');
// mysql2, bcryptjs and dotenv are backend deps: load them from there instead of duplicating them here.
const backendRequire = createRequire(path.join(backendDir, 'package.json'));
const mysql = backendRequire('mysql2/promise');
const bcrypt = backendRequire('bcryptjs');
const dotenv = backendRequire('dotenv');

const PASSWORD = 'E2e-password-1';
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

type Conn = { query: (sql: string, params?: unknown[]) => Promise<[unknown, unknown]>; end: () => Promise<void> };

// server.js generates 14 days of slots right after listen(), i.e. after the health URL is up.
// Wait for that to finish so the DB reset below does not race with it.
async function waitForStartupSlots(cfg: object) {
  const last = localDate(addDays(13));
  for (let i = 0; i < 60; i += 1) {
    let conn: Conn | undefined;
    try {
      conn = await mysql.createConnection(cfg);
      const [[d]] = (await conn!.query('SELECT COUNT(*) AS n FROM doctors')) as [{ n: number }[], unknown];
      const [[s]] = (await conn!.query('SELECT COUNT(*) AS n FROM doctor_slots WHERE date = ?', [last])) as [{ n: number }[], unknown];
      if (d.n === 0 || s.n >= d.n * 32) return;
    } catch {
      return; // no test DB yet: the startup job failed fast, nothing to wait for
    } finally {
      await conn?.end();
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export default async function globalSetup() {
  // Never override: an exported DB_PASSWORD (e.g. empty for a local XAMPP root) must win over .env.test.
  dotenv.config({ path: path.join(backendDir, '.env.test'), quiet: true });
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  const cfg = { host: DB_HOST, user: DB_USER, password: DB_PASSWORD, database: DB_NAME };

  await waitForStartupSlots(cfg);
  execFileSync(process.execPath, ['database/setupTestDb.js'], { cwd: backendDir, stdio: 'inherit', env: process.env });

  const conn: Conn = await mysql.createConnection(cfg);
  try {
    const hash = bcrypt.hashSync(PASSWORD, 4);
    const insertUser = async (name: string, email: string, role: string, phone: string | null = null) => {
      const [r] = (await conn.query('INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)',
        [name, email, hash, role, phone])) as [{ insertId: number }, unknown];
      return r.insertId;
    };

    await insertUser('E2E Admin', 'e2e-admin@hms.test', 'admin');
    const doctorUserId = await insertUser('Dr. E2E Doctor', 'e2e-doctor@hms.test', 'doctor');
    const patientId = await insertUser('E2E Patient', 'e2e-patient@hms.test', 'patient', '9000000001');
    await insertUser('E2E Trauma Patient', 'e2e-trauma@hms.test', 'patient', '9000000002');
    const [d] = (await conn.query('INSERT INTO doctors (user_id, specialization, fees) VALUES (?, ?, ?)',
      [doctorUserId, 'Dermatology', 800])) as [{ insertId: number }, unknown];
    const doctorId = d.insertId;

    // Slots for tomorrow (09:00-16:45, 15 min), same shape as utils/generateSlots.js.
    const tomorrow = localDate(addDays(1));
    const times: string[] = [];
    for (let h = 9; h < 17; h += 1) for (let m = 0; m < 60; m += 15) times.push(`${pad(h)}:${pad(m)}:00`);
    await conn.query('INSERT IGNORE INTO doctor_slots (doctor_id, date, time, is_booked, is_available) VALUES ?',
      [times.map((t) => [doctorId, tomorrow, t, 0, 1])]);

    const appointment = async (docId: number, date: string, time: string, type: 'in_person' | 'video', paid: boolean) => {
      await conn.query('INSERT IGNORE INTO doctor_slots (doctor_id, date, time, is_booked, is_available) VALUES (?, ?, ?, 0, 1)', [docId, date, time]);
      const [[slot]] = (await conn.query('SELECT id FROM doctor_slots WHERE doctor_id = ? AND date = ? AND time = ?',
        [docId, date, time])) as [{ id: number }[], unknown];
      await conn.query('UPDATE doctor_slots SET is_booked = 1 WHERE id = ?', [slot.id]);
      const [r] = (await conn.query(
        `INSERT INTO appointments (patient_id, doctor_id, slot_id, active_slot_id, status, consultation_type, video_room, payment_status)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [patientId, docId, slot.id, slot.id, type, type === 'video' ? `hms-${randomBytes(16).toString('hex')}` : null, paid ? 'paid' : 'unpaid'],
      )) as [{ insertId: number }, unknown];
      return r.insertId;
    };

    // Payments spec: an unpaid in-person visit with a seeded sample doctor, so its history card is unique.
    const [[sarah]] = (await conn.query("SELECT d.id FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.email = 'sarah@hms.com'")) as [{ id: number }[], unknown];
    await appointment(sarah.id, tomorrow, '10:00:00', 'in_person', false);
    // Teleconsult spec: an unpaid video visit, and a paid one starting now (inside the join window).
    // The odd seconds keep the "now" slot clear of the generated :00 slots.
    const now = new Date();
    // Not tomorrow: one patient may hold one visit per doctor per day, and the booking spec books tomorrow.
    const unpaidVideoId = await appointment(doctorId, localDate(addDays(2)), '11:00:00', 'video', false);
    const paidVideoId = await appointment(doctorId, localDate(now), `${pad(now.getHours())}:${pad(now.getMinutes())}:07`, 'video', true);

    const [w] = (await conn.query("INSERT INTO wards (name, ward_type, floor) VALUES ('E2E Ward', 'general', 1)")) as [{ insertId: number }, unknown];
    await conn.query('INSERT INTO beds (ward_id, bed_number, daily_rate) VALUES (?, ?, 1000), (?, ?, 1000)', [w.insertId, 'E2E-01', w.insertId, 'E2E-ER']);

    const fixtures: E2EFixtures = {
      password: PASSWORD,
      admin: { email: 'e2e-admin@hms.test', name: 'E2E Admin' },
      doctor: { email: 'e2e-doctor@hms.test', name: 'Dr. E2E Doctor' },
      patient: { email: 'e2e-patient@hms.test', name: 'E2E Patient' },
      traumaPatient: { name: 'E2E Trauma Patient' },
      unpaidVideoId,
      paidVideoId,
    };
    fs.writeFileSync(path.join(here, '.auth-fixtures.json'), JSON.stringify(fixtures, null, 2));
  } finally {
    await conn.end();
  }
}
