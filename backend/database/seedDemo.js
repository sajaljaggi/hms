/**
 * Fills the database with realistic demo activity so the site looks in use: patients, two months of
 * appointments (with prescriptions, ratings and payments), upcoming visits, blood donors/stock/requests,
 * wards and admitted patients, bed requests and an active emergency board.
 *
 * Uses the doctors already in the database. Runs once (demo patients use @demo.example.com) and in one
 * transaction, so a failure leaves nothing half-written. Demo patients log in with password "password".
 *
 * A second step (also run once) gives the existing non-demo patients a history of visits with detailed
 * prescriptions, and attaches a prescription PDF to nearly every prescription.
 *
 * Usage: node database/seedDemo.js   (reads backend/.env)
 */
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const db = require('../config/db');
const { generateSlotsForDoctorDate } = require('../utils/generateSlots');
const { computeExpiry } = require('../utils/bloodCompatibility');

const DEMO_DOMAIN = 'demo.example.com';

// Deterministic randomness, so a re-seed of a fresh database looks the same.
let seed = 20261122;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];
const chance = (p) => rand() < p;
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const weighted = (pairs) => { let r = rand() * pairs.reduce((s, [, w]) => s + w, 0); for (const [v, w] of pairs) { if ((r -= w) < 0) return v; } return pairs[0][0]; };
const hex = (n) => crypto.randomBytes(n).toString('hex');

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysFrom = (n, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const at = (d, time) => new Date(`${dateStr(d)}T${time}`);
const sql = (d) => `${dateStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const minutesAgo = (m) => new Date(Date.now() - m * 60000);

const FIRST_M = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Kabir', 'Ishaan', 'Rahul', 'Sourav', 'Anirban', 'Debashis', 'Sandeep', 'Manish', 'Vikram', 'Amit', 'Subhajit', 'Rajesh', 'Nikhil', 'Pranav', 'Imran', 'Farhan', 'Joydeep', 'Arnab', 'Siddhant', 'Harsh'];
const FIRST_F = ['Ananya', 'Diya', 'Priya', 'Sneha', 'Riya', 'Kavya', 'Pooja', 'Meera', 'Ishita', 'Tanvi', 'Shreya', 'Payel', 'Moumita', 'Ritika', 'Neha', 'Sana', 'Aisha', 'Nandini', 'Swati', 'Rupa', 'Anjali', 'Debolina', 'Trisha', 'Simran', 'Bhavna'];
const LAST = ['Banerjee', 'Chatterjee', 'Mukherjee', 'Das', 'Ghosh', 'Bose', 'Sen', 'Roy', 'Dutta', 'Sharma', 'Gupta', 'Agarwal', 'Singh', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Khan', 'Ahmed', 'Patel', 'Mishra', 'Saha', 'Kundu', 'Mondal', 'Pal'];
const CITIES = [['Kolkata', 6], ['New Town', 4], ['Salt Lake', 3], ['Howrah', 2], ['Rajarhat', 2], ['Dum Dum', 1], ['Barasat', 1]];
const AREAS = ['Action Area I', 'Action Area II', 'Sector V', 'Ballygunge', 'Park Street', 'Behala', 'Gariahat', 'Lake Town', 'Kasba', 'Tollygunge'];
const HISTORY = ['', '', '', 'Type 2 diabetes', 'Hypertension', 'Asthma', 'Hypothyroidism', 'Allergic to penicillin', 'Migraine', 'Previous knee surgery (2021)', 'High cholesterol'];

const REASONS = {
  Cardiology: ['Chest discomfort on exertion', 'Palpitations', 'High blood pressure follow-up', 'Breathlessness while climbing stairs', 'ECG review'],
  Dermatology: ['Persistent acne', 'Itchy rash on arms', 'Hair fall', 'Eczema flare-up', 'Mole check'],
  Neurology: ['Recurring migraines', 'Dizziness', 'Numbness in fingers', 'Sleep problems and headaches', 'Follow-up after MRI'],
  Orthopedics: ['Knee pain', 'Lower back pain', 'Shoulder stiffness', 'Ankle sprain', 'Neck pain from desk work'],
  'General Medicine': ['Fever and cold', 'Stomach ache', 'Routine check-up', 'Cough for two weeks', 'Fatigue and body ache'],
};
const NOTES = {
  Cardiology: ['Tab. Amlodipine 5 mg once daily. Low-salt diet, 30 min walk daily. Review in 4 weeks with BP log.', 'ECG normal. Echo advised. Avoid heavy exertion until review.', 'Tab. Atorvastatin 10 mg at night. Lipid profile after 6 weeks.'],
  Dermatology: ['Adapalene gel at night, sunscreen SPF 50 daily. Review in 6 weeks.', 'Cetirizine 10 mg at night for 7 days. Moisturise twice daily; avoid hot showers.', 'Minoxidil 5% topical; check vitamin D and ferritin.'],
  Neurology: ['Migraine diary for 4 weeks. Tab. Propranolol 20 mg twice daily. Limit screen time.', 'Vestibular exercises taught. B12 levels advised.', 'Nerve conduction study advised. Vitamin B complex for 30 days.'],
  Orthopedics: ['Knee strengthening exercises; physiotherapy 3x/week. Paracetamol as needed.', 'Hot fomentation, core strengthening. Ergonomic chair advised. Review in 3 weeks.', 'Crepe bandage and rest for 1 week. X-ray if pain persists.'],
  'General Medicine': ['Paracetamol 650 mg as needed, plenty of fluids, rest for 3 days.', 'CBC and thyroid profile advised. Review with reports.', 'Pantoprazole 40 mg before breakfast for 14 days. Avoid spicy food.'],
};

async function main() {
  const conn = await db.getConnection();
  try {
    const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM users WHERE email LIKE ?", [`%@${DEMO_DOMAIN}`]);
    if (n > 0) { console.log(`Demo data is already loaded (${n} demo patients). Nothing to do.`); return; }

    const [doctors] = await conn.query('SELECT d.id, d.user_id, d.specialization, d.fees, u.name FROM doctors d JOIN users u ON u.id = d.user_id');
    if (doctors.length === 0) throw new Error('No doctors found. Add doctors first (node seedData.js or the admin panel).');
    const [[admin]] = await conn.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
    const adminId = admin ? admin.id : null;

    // Slots must exist for every day used (past days included) before the transaction picks them.
    for (let d = -60; d <= 10; d++) for (const doc of doctors) await generateSlotsForDoctorDate(doc.id, dateStr(daysFrom(d)));

    await conn.beginTransaction();
    const hash = await bcrypt.hash('password', 10);

    // ── Patients ────────────────────────────────────────────────────────────
    const patients = [];
    const usedNames = new Set();
    for (let i = 0; i < 60; i++) {
      const gender = chance(0.5) ? 'male' : 'female';
      let name;
      do { name = `${pick(gender === 'male' ? FIRST_M : FIRST_F)} ${pick(LAST)}`; } while (usedNames.has(name));
      usedNames.add(name);
      const age = weighted([[int(3, 15), 1], [int(18, 35), 4], [int(36, 60), 4], [int(61, 82), 2]]);
      const email = `${name.toLowerCase().replace(/\s+/g, '.')}@${DEMO_DOMAIN}`;
      const [r] = await conn.query(
        `INSERT INTO users (name, email, password, role, phone, gender, age, weight, address, city, guardian_name, medical_history, created_at)
         VALUES (?, ?, ?, 'patient', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, email, hash, `9${int(100000000, 999999999)}`, gender, age, age < 16 ? int(15, 50) : int(48, 92),
          `${int(1, 220)}, ${pick(AREAS)}`, weighted(CITIES), age < 16 ? `${pick(FIRST_M)} ${name.split(' ')[1]}` : null,
          pick(HISTORY) || null, sql(minutesAgo(int(60, 160) * 24 * 60))]
      );
      patients.push({ id: r.insertId, name, age, gender, upcoming: 0, days: new Set() });
    }

    // ── Appointments: 60 days of history, today, and the next 10 days ───────
    const takeSlot = async (doc, d, { future }) => {
      const [free] = await conn.query(
        'SELECT id, time FROM doctor_slots WHERE doctor_id = ? AND date = ? AND is_booked = 0 AND is_available = 1 ORDER BY id',
        [doc.id, dateStr(d)]
      );
      const ok = free.filter((s) => !future || at(d, s.time) > new Date());
      return ok.length ? pick(ok) : null;
    };
    let apptCount = 0;
    for (let offset = -60; offset <= 10; offset++) {
      const day = daysFrom(offset);
      const perDay = day.getDay() === 0 ? int(2, 4) : int(6, 11);
      for (let k = 0; k < perDay; k++) {
        const doc = pick(doctors);
        const isFuture = offset > 0 || (offset === 0 && chance(0.6));
        const slot = await takeSlot(doc, day, { future: isFuture });
        if (!slot) continue;
        const start = at(day, slot.time);
        const future = start > new Date();
        const p = pick(patients.filter((x) => !x.days.has(`${doc.id}:${offset}`) && (!future || x.upcoming < 5)));
        if (!p) continue;
        p.days.add(`${doc.id}:${offset}`);
        if (future) p.upcoming += 1;

        const status = future ? 'pending' : weighted([['completed', 86], ['cancelled', 9], ['pending', 5]]);
        const video = chance(0.2);
        const paid = video || (status !== 'cancelled' && chance(future ? 0.35 : 0.7)) || (status === 'cancelled' && chance(0.3));
        const booked = new Date(start.getTime() - int(1, 7) * 86400000 - int(0, 600) * 60000);
        const [a] = await conn.query(
          `INSERT INTO appointments (patient_id, doctor_id, slot_id, active_slot_id, status, reason, consultation_type, video_room, payment_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, doc.id, slot.id, status === 'cancelled' ? null : slot.id, status, pick(REASONS[doc.specialization] || REASONS['General Medicine']),
            video ? 'video' : 'in_person', video ? `hms-${hex(16)}` : null, paid ? 'paid' : 'unpaid', sql(booked > new Date() ? minutesAgo(int(30, 600)) : booked)]
        );
        apptCount += 1;
        if (status !== 'cancelled') await conn.query('UPDATE doctor_slots SET is_booked = 1 WHERE id = ?', [slot.id]);
        if (paid) {
          const paidAt = new Date(Math.min(booked.getTime() + int(5, 120) * 60000, Date.now() - 60000));
          await conn.query(
            `INSERT INTO payments (appointment_id, patient_id, amount_paise, provider, provider_order_id, provider_payment_id, status, paid_at, created_at)
             VALUES (?, ?, ?, 'mock', ?, ?, ?, ?, ?)`,
            [a.insertId, p.id, Math.round(Number(doc.fees) * 100), `order_demo_${hex(10)}`, `pay_demo_${hex(10)}`,
              status === 'cancelled' ? 'refund_due' : 'paid', sql(paidAt), sql(paidAt)]
          );
        }
        if (status === 'completed') {
          const after = new Date(start.getTime() + int(15, 90) * 60000);
          await conn.query(
            'INSERT INTO prescriptions (appointment_id, doctor_id, patient_id, notes, created_at) VALUES (?, ?, ?, ?, ?)',
            [a.insertId, doc.id, p.id, pick(NOTES[doc.specialization] || NOTES['General Medicine']), sql(after)]
          );
          if (chance(0.55)) {
            const stars = weighted([[5, 50], [4, 35], [3, 10], [2, 4], [1, 1]]);
            await conn.query('INSERT INTO ratings (appointment_id, doctor_id, patient_id, stars, created_at) VALUES (?, ?, ?, ?, ?)',
              [a.insertId, doc.id, p.id, stars, sql(new Date(after.getTime() + int(1, 48) * 3600000))]);
          }
        }
      }
    }
    await conn.query(
      `UPDATE doctors d JOIN (SELECT doctor_id, ROUND(AVG(stars), 2) AS r, COUNT(*) AS c FROM ratings GROUP BY doctor_id) x
         ON x.doctor_id = d.id SET d.rating = x.r, d.rating_count = x.c`
    );

    // ── Blood bank: donors, stock and requests ──────────────────────────────
    const GROUPS = [['O+', 34], ['B+', 30], ['A+', 20], ['AB+', 7], ['O-', 3], ['B-', 2], ['A-', 2], ['AB-', 1]];
    const donors = [];
    for (let i = 0; i < 45; i++) {
      const g = chance(0.5) ? 'male' : 'female';
      const name = `${pick(g === 'male' ? FIRST_M : FIRST_F)} ${pick(LAST)}`;
      const group = weighted(GROUPS);
      const [r] = await conn.query('INSERT INTO blood_donors (name, blood_group, phone, email, created_at) VALUES (?, ?, ?, ?, ?)',
        [name, group, `9${int(100000000, 999999999)}`, chance(0.6) ? `${name.toLowerCase().replace(/\s+/g, '.')}${int(1, 99)}@${DEMO_DOMAIN}` : null,
          sql(minutesAgo(int(70, 300) * 24 * 60))]);
      donors.push({ id: r.insertId, group });
    }
    const units = [];
    for (const d of donors) {
      // One donation each within the last ~55 days (donors must wait 56 days between donations).
      const collected = daysFrom(-int(0, 55));
      const component = weighted([['packed_rbc', 45], ['whole_blood', 20], ['plasma', 20], ['platelets', 15]]);
      const expires = computeExpiry(dateStr(collected), component);
      const status = expires < dateStr(new Date()) ? 'expired' : chance(0.04) ? 'discarded' : 'available';
      const [r] = await conn.query(
        `INSERT INTO blood_units (donor_id, blood_group, component, volume_ml, collected_on, expires_on, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.id, d.group, component, component === 'plasma' ? 250 : component === 'platelets' ? 50 : 350, dateStr(collected), expires, status, `${dateStr(collected)} 11:00:00`]
      );
      await conn.query('UPDATE blood_donors SET last_donation_date = ? WHERE id = ?', [dateStr(collected), d.id]);
      units.push({ id: r.insertId, group: d.group, component, status });
    }
    // Plasma from earlier drives keeps for a year: a steady base stock.
    for (let i = 0; i < 18; i++) {
      const d = pick(donors);
      const collected = daysFrom(-int(80, 200));
      await conn.query(
        `INSERT INTO blood_units (donor_id, blood_group, component, volume_ml, collected_on, expires_on, status, created_at)
         VALUES (?, ?, 'plasma', 250, ?, ?, 'available', ?)`,
        [d.id, d.group, dateStr(collected), computeExpiry(dateStr(collected), 'plasma'), `${dateStr(collected)} 11:00:00`]
      );
    }
    const doctorUser = () => pick(doctors).user_id;
    const bloodReq = async ({ status, urgency, ageDays, issue }) => {
      const p = pick(patients);
      const unit = issue ? units.find((u) => u.status === 'available' && u.component === 'packed_rbc') : null;
      const group = unit ? unit.group : weighted(GROUPS);
      const created = minutesAgo(ageDays * 24 * 60 + int(10, 600));
      const [r] = await conn.query(
        `INSERT INTO blood_requests (patient_id, requested_by, blood_group, component, units_requested, urgency, status, notes, created_at, fulfilled_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
        [p.id, doctorUser(), group, unit ? 'packed_rbc' : weighted([['packed_rbc', 60], ['platelets', 20], ['plasma', 20]]), urgency, status,
          pick(['Pre-operative', 'Post-partum haemorrhage', 'Anaemia, Hb 6.8', 'Dengue, low platelets', 'Road accident trauma', null]),
          sql(created), status === 'fulfilled' ? sql(new Date(created.getTime() + int(20, 180) * 60000)) : null]
      );
      if (unit) { unit.status = 'issued'; await conn.query("UPDATE blood_units SET status = 'issued', request_id = ? WHERE id = ?", [r.insertId, unit.id]); }
    };
    for (let i = 0; i < 9; i++) await bloodReq({ status: 'fulfilled', urgency: weighted([['routine', 5], ['urgent', 3], ['emergency', 2]]), ageDays: int(1, 40), issue: true });
    for (const urgency of ['emergency', 'urgent', 'routine', 'routine']) await bloodReq({ status: 'pending', urgency, ageDays: 0 });
    for (let i = 0; i < 2; i++) await bloodReq({ status: 'rejected', urgency: 'routine', ageDays: int(3, 20) });
    await bloodReq({ status: 'cancelled', urgency: 'routine', ageDays: int(2, 10) });

    // ── Wards and beds ──────────────────────────────────────────────────────
    const newWards = [['Maternity Ward', 'maternity', 3, 'MT', 8, 2500], ['Pediatric Ward', 'pediatric', 3, 'PD', 8, 2000], ['Private Rooms', 'private', 4, 'PR', 6, 8000]];
    for (const [wname, type, floor, prefix, count, rate] of newWards) {
      const [ex] = await conn.query('SELECT id FROM wards WHERE name = ?', [wname]);
      const wardId = ex.length ? ex[0].id : (await conn.query('INSERT INTO wards (name, ward_type, floor) VALUES (?, ?, ?)', [wname, type, floor]))[0].insertId;
      for (let i = 1; i <= count; i++) {
        await conn.query('INSERT IGNORE INTO beds (ward_id, bed_number, daily_rate) VALUES (?, ?, ?)', [wardId, `${prefix}-${pad(i)}`, rate]);
      }
    }
    const [beds] = await conn.query("SELECT b.id, b.status, w.ward_type, w.name AS ward FROM beds b JOIN wards w ON w.id = b.ward_id ORDER BY b.id");
    const [admittedRows] = await conn.query('SELECT patient_id FROM bed_allocations WHERE discharged_at IS NULL');
    const admitted = new Set(admittedRows.map((r) => r.patient_id));
    const WARD_REASON = {
      icu: ['Post-operative monitoring', 'Acute MI, observation', 'Respiratory distress'], general: ['Dengue fever', 'Typhoid', 'Observation after fall', 'Pneumonia'],
      emergency: ['Road traffic accident', 'Severe dehydration', 'Chest pain under evaluation'], maternity: ['Labour, admitted for delivery', 'Post C-section recovery'],
      pediatric: ['High fever, child', 'Bronchiolitis', 'Gastroenteritis, child'], private: ['Elective knee replacement', 'Cardiac evaluation', 'Post-surgery recovery'],
    };
    const freePatient = (pred = () => true) => {
      const p = pick(patients.filter((x) => !admitted.has(x.id) && pred(x)));
      if (p) admitted.add(p.id);
      return p;
    };
    const occupied = [];
    for (const b of beds) {
      if (b.status !== 'available') continue;
      const fill = { icu: 0.7, emergency: 0.5, general: 0.6, maternity: 0.5, pediatric: 0.5, private: 0.5 }[b.ward_type] ?? 0.5;
      if (!chance(fill)) { if (chance(0.06)) await conn.query("UPDATE beds SET status = ? WHERE id = ?", [chance(0.5) ? 'maintenance' : 'reserved', b.id]); continue; }
      const p = freePatient((x) => (b.ward_type === 'pediatric' ? x.age < 16 : b.ward_type === 'maternity' ? x.gender === 'female' && x.age >= 20 && x.age <= 40 : x.age >= 16));
      if (!p) continue;
      const doc = pick(doctors);
      const [r] = await conn.query(
        `INSERT INTO bed_allocations (bed_id, patient_id, allocated_by, attending_doctor_id, reason, admitted_at, open_patient_id, open_bed_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.id, p.id, adminId, doc.user_id, pick(WARD_REASON[b.ward_type] || WARD_REASON.general), sql(minutesAgo(int(2, 9 * 24) * 60)), p.id, b.id]
      );
      await conn.query("UPDATE beds SET status = 'occupied' WHERE id = ?", [b.id]);
      occupied.push({ allocationId: r.insertId, bed: b, patient: p, doctorUserId: doc.user_id });
    }
    // Past admissions, already discharged.
    for (let i = 0; i < 30; i++) {
      const b = pick(beds);
      const p = pick(patients);
      const admittedAt = minutesAgo(int(10, 58) * 24 * 60);
      await conn.query(
        `INSERT INTO bed_allocations (bed_id, patient_id, allocated_by, attending_doctor_id, reason, admitted_at, discharged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [b.id, p.id, adminId, pick(doctors).user_id, pick(WARD_REASON[b.ward_type] || WARD_REASON.general), sql(admittedAt),
          sql(new Date(admittedAt.getTime() + int(1, 7) * 86400000))]
      );
    }

    // ── Bed requests: pending admissions and discharges, plus history ───────
    const bedReq = (f) => conn.query(
      `INSERT INTO bed_requests (request_type, patient_id, requested_by, ward_type, allocation_id, urgency, status, reason, admin_notes, open_key, created_at, resolved_at, resolved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.type, f.patientId, f.by, f.wardType ?? null, f.allocationId ?? null, f.urgency, f.status, f.reason ?? null, f.notes ?? null,
        f.status === 'pending' ? (f.type === 'admission' ? `admission:${f.patientId}` : `discharge:${f.allocationId}`) : null,
        sql(f.created), f.status === 'pending' ? null : sql(new Date(f.created.getTime() + int(20, 240) * 60000)), f.status === 'pending' ? null : adminId]
    );
    for (const [wardType, urgency, reason] of [['icu', 'emergency', 'Suspected stroke, needs ICU monitoring'], ['general', 'urgent', 'Dengue with falling platelets'],
      ['private', 'routine', 'Elective admission for knee replacement'], [null, 'routine', 'Observation overnight']]) {
      const p = freePatient((x) => x.age >= 16);
      if (p) await bedReq({ type: 'admission', patientId: p.id, by: pick(doctors).user_id, wardType, urgency, status: 'pending', reason, created: minutesAgo(int(15, 300)) });
    }
    for (const o of occupied.slice(0, 3)) {
      await bedReq({ type: 'discharge', patientId: o.patient.id, by: o.doctorUserId, allocationId: o.allocationId, urgency: 'routine', status: 'pending',
        reason: pick(['Recovered, vitals stable', 'Fit for discharge, follow up in OPD', 'Stable, can continue care at home']), created: minutesAgo(int(10, 200)) });
    }
    for (const o of occupied.slice(3, 9)) {
      await bedReq({ type: 'admission', patientId: o.patient.id, by: o.doctorUserId, wardType: o.bed.ward_type, allocationId: o.allocationId,
        urgency: pick(['routine', 'urgent']), status: 'fulfilled', reason: pick(WARD_REASON[o.bed.ward_type] || WARD_REASON.general), created: minutesAgo(int(3, 9) * 24 * 60) });
    }
    for (const notes of ['No ICU bed free, shifted to partner hospital', 'Patient can be managed in OPD']) {
      const p = pick(patients);
      await bedReq({ type: 'admission', patientId: p.id, by: pick(doctors).user_id, wardType: 'icu', urgency: 'urgent', status: 'rejected', notes, created: minutesAgo(int(2, 15) * 24 * 60) });
    }

    // ── Emergency board: active arrivals and today's closed cases ───────────
    const CASES = [
      [1, 'Cardiac arrest, CPR in progress', 'ambulance', { heart_rate: 0, spo2: 70 }, 'in_treatment'],
      [2, 'Severe chest pain radiating to left arm', 'ambulance', { heart_rate: 118, bp_systolic: 165, bp_diastolic: 100, spo2: 93 }, 'in_treatment'],
      [2, 'Road traffic accident, head injury', 'ambulance', { heart_rate: 110, bp_systolic: 100, bp_diastolic: 65, spo2: 95, resp_rate: 24 }, 'waiting'],
      [3, 'High fever with rigors, vomiting', 'walk_in', { heart_rate: 104, temperature: 39.6, spo2: 97 }, 'waiting'],
      [3, 'Abdominal pain, right lower quadrant', 'walk_in', { heart_rate: 96, temperature: 38.1 }, 'in_treatment'],
      [4, 'Cut on hand, needs sutures', 'walk_in', { heart_rate: 82 }, 'waiting'],
      [5, 'Mild allergic rash', 'referral', { heart_rate: 78, temperature: 36.9 }, 'waiting'],
    ];
    for (const [level, complaint, mode, vitals, status] of CASES) {
      const p = chance(0.6) ? pick(patients.filter((x) => !admitted.has(x.id) && x.age >= 16)) : null;
      const g = p ? p.gender : chance(0.5) ? 'male' : 'female';
      const name = p ? p.name : `${pick(g === 'male' ? FIRST_M : FIRST_F)} ${pick(LAST)}`;
      await conn.query(
        `INSERT INTO emergency_cases (patient_id, patient_name, age, gender, contact_phone, chief_complaint, arrival_mode, triage_level,
           heart_rate, resp_rate, bp_systolic, bp_diastolic, spo2, temperature, status, assigned_doctor_id, created_by, arrived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p ? p.id : null, name, p ? p.age : int(18, 75), g, `9${int(100000000, 999999999)}`, complaint, mode, level,
          vitals.heart_rate ?? null, vitals.resp_rate ?? null, vitals.bp_systolic ?? null, vitals.bp_diastolic ?? null, vitals.spo2 ?? null, vitals.temperature ?? null,
          status, status === 'in_treatment' ? pick(doctors).id : null, pick(doctors).user_id, sql(minutesAgo(int(5, 170)))]
      );
    }
    for (let i = 0; i < 9; i++) {
      const arrived = minutesAgo(int(4, 30) * 60);
      await conn.query(
        `INSERT INTO emergency_cases (patient_name, age, gender, chief_complaint, arrival_mode, triage_level, heart_rate, status, assigned_doctor_id, created_by, arrived_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`${pick(chance(0.5) ? FIRST_M : FIRST_F)} ${pick(LAST)}`, int(5, 80), chance(0.5) ? 'male' : 'female',
          pick(['Sprained ankle', 'Asthma attack', 'Food poisoning', 'Minor burn', 'Fainting episode', 'Dog bite']), pick(['walk_in', 'ambulance']),
          int(2, 5), int(70, 120), pick(['discharged', 'discharged', 'discharged', 'transferred']), pick(doctors).id, pick(doctors).user_id,
          sql(arrived), sql(new Date(arrived.getTime() + int(40, 240) * 60000))]
      );
    }

    // ── A few unread alerts for the admin ───────────────────────────────────
    if (adminId) {
      const alerts = [
        ['emergency', 'ESI 1 emergency arrival', 'Cardiac arrest, CPR in progress', '/admin/emergency', 8],
        ['bed', 'Emergency bed request', 'Bed request for a suspected stroke patient (emergency).', '/admin/beds', 20],
        ['blood', 'Emergency blood request', '1 unit of packed RBC needed urgently.', '/admin/blood', 35],
        ['bed', 'Discharge request', 'A doctor asked to discharge a recovered patient.', '/admin/beds', 50],
        ['payment', 'Payment received', 'Payment received for a video consultation.', '/admin/payments', 90],
      ];
      for (const [type, title, message, link, ago] of alerts) {
        await conn.query('INSERT INTO notifications (user_id, type, title, message, link, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [adminId, type, title, message, link, sql(minutesAgo(ago))]);
      }
    }

    await conn.commit();
    console.log(`✅ Demo data loaded: ${patients.length} patients, ${apptCount} appointments, ${donors.length} blood donors, `
      + `${occupied.length} admitted patients, ${CASES.length} active emergency cases. Demo patients sign in with password "password".`);
  } catch (err) {
    try { await conn.rollback(); } catch { /* not in a transaction yet */ }
    throw err;
  } finally {
    conn.release();
  }
}

// ── Patient records: real patients' history, detailed prescriptions, prescription PDFs ──────────────

const RX = {
  Cardiology: [
    { dx: 'Stage 1 hypertension', meds: ['Tab. Amlodipine 5 mg - once daily, morning - 30 days', 'Tab. Ecosprin 75 mg - once daily after lunch - 30 days'], advice: 'Low-salt diet, 30 min brisk walk daily. Keep a BP log.', review: 'Review in 4 weeks with BP log and lipid profile.' },
    { dx: 'Palpitations, likely anxiety-related; ECG normal', meds: ['Tab. Propranolol 10 mg - twice daily - 14 days'], advice: 'Limit caffeine. Practise slow breathing when palpitations start.', review: 'Holter monitoring if symptoms persist. Review in 2 weeks.' },
    { dx: 'Dyslipidaemia', meds: ['Tab. Atorvastatin 10 mg - at night - 90 days'], advice: 'Avoid fried food, include oats and fruits.', review: 'Repeat lipid profile after 6 weeks.' },
  ],
  Dermatology: [
    { dx: 'Acne vulgaris (moderate)', meds: ['Adapalene 0.1% gel - thin layer at night', 'Clindamycin 1% gel - morning', 'Sunscreen SPF 50 - daily'], advice: 'Do not squeeze lesions. Use a gentle face wash twice daily.', review: 'Review in 6 weeks.' },
    { dx: 'Contact dermatitis, forearms', meds: ['Tab. Cetirizine 10 mg - at night - 7 days', 'Mometasone 0.1% cream - twice daily - 7 days'], advice: 'Avoid the new detergent. Moisturise twice daily.', review: 'Review if not better in 1 week.' },
  ],
  Neurology: [
    { dx: 'Migraine without aura', meds: ['Tab. Propranolol 20 mg - twice daily - 30 days', 'Tab. Naproxen 500 mg - at onset of headache, max 2/day'], advice: 'Regular sleep, avoid skipping meals, limit screen time. Keep a headache diary.', review: 'Review in 4 weeks with the diary.' },
    { dx: 'Peripheral neuropathy, vitamin B12 deficiency', meds: ['Inj. Methylcobalamin 1500 mcg - weekly x 4', 'Tab. Vitamin B complex - once daily - 30 days'], advice: 'Foot care, avoid walking barefoot.', review: 'Repeat B12 after 3 months.' },
  ],
  Orthopedics: [
    { dx: 'Early osteoarthritis, right knee', meds: ['Tab. Paracetamol 650 mg - when needed, max 3/day', 'Diclofenac gel - local application twice daily'], advice: 'Quadriceps strengthening exercises. Physiotherapy 3 times a week. Reduce weight.', review: 'Review in 3 weeks.' },
    { dx: 'Mechanical low back pain', meds: ['Tab. Aceclofenac 100 mg - twice daily after food - 5 days', 'Tab. Thiocolchicoside 4 mg - twice daily - 5 days'], advice: 'Hot fomentation, core strengthening, ergonomic chair at work.', review: 'MRI if pain persists beyond 4 weeks.' },
  ],
  'General Medicine': [
    { dx: 'Acute viral fever', meds: ['Tab. Paracetamol 650 mg - every 6 hours if fever - 3 days', 'ORS - 1 sachet in 1 L water, sip through the day'], advice: 'Rest, plenty of fluids. Check temperature twice a day.', review: 'Return if fever lasts beyond 3 days or new symptoms.' },
    { dx: 'Acid peptic disease', meds: ['Tab. Pantoprazole 40 mg - before breakfast - 14 days', 'Syp. Antacid 10 ml - after meals when needed'], advice: 'Small frequent meals, avoid spicy food and late dinners.', review: 'Review in 2 weeks.' },
    { dx: 'Routine health check-up', meds: ['Tab. Vitamin D3 60000 IU - once a week - 8 weeks'], advice: 'Blood reports within normal limits except low vitamin D. 20 min morning sunlight.', review: 'Annual check-up.' },
  ],
};
const rxNotes = (rx) => `Diagnosis: ${rx.dx}\n\nRx:\n${rx.meds.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nAdvice: ${rx.advice}\nFollow-up: ${rx.review}`;

// A one-page prescription PDF on hospital letterhead. Plain PDF 1.4 with the built-in Helvetica fonts.
function prescriptionPdf({ doctor, specialization, patient, age, gender, date, notes, rxNo }) {
  const ascii = (t) => String(t).replace(/[^\x20-\x7e]/g, '-').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const lines = [];
  // bold: true, false, or 'label' (only a leading 'Diagnosis:' / 'Rx:' / 'Advice:' / 'Follow-up:' is bold)
  const add = (text, size = 10, bold = false, gap = 6) => lines.push({ text, size, bold, gap });
  add('Care & Cure Hospital', 18, true, 4);
  add('DJ Block (Newtown), Action Area I, New Town, West Bengal 700156  |  +91 33 2476 5102', 8, false, 18);
  add(`${doctor}  -  ${specialization}`, 11, true, 4);
  add(`Rx No. ${rxNo}    Date: ${date}`, 9, false, 14);
  add(`Patient: ${patient}${age ? `    Age: ${age}` : ''}${gender ? `    Sex: ${gender}` : ''}`, 10, true, 16);
  for (const raw of String(notes).split('\n')) {
    // Wrap long lines at word boundaries, ~90 characters wide.
    let line = '';
    let first = true; // only a paragraph's first line can start with a bold label
    const flush = () => { add(line, 10, first ? 'label' : false, 5); first = false; };
    for (const word of raw.split(' ')) {
      if (line && (line + ' ' + word).length > 90) { flush(); line = `   ${word}`; } else line = line ? `${line} ${word}` : word;
    }
    flush();
  }
  add('', 10, false, 30);
  add(`${doctor}`, 10, true, 2);
  add('This is a computer-generated prescription.', 8, false, 2);

  let y = 800;
  let body = 'BT\n';
  let ruleY = 0;
  for (const [i, l] of lines.entries()) {
    const label = l.bold === 'label' && /^(Diagnosis|Rx|Advice|Follow-up):/.exec(l.text);
    const runs = label
      ? `/F2 ${l.size} Tf (${ascii(label[0])}) Tj /F1 ${l.size} Tf (${ascii(l.text.slice(label[0].length))}) Tj`
      : `/${l.bold === true ? 'F2' : 'F1'} ${l.size} Tf (${ascii(l.text)}) Tj`;
    body += `1 0 0 1 50 ${y} Tm ${runs}\n`;
    if (i === 1) ruleY = y - 8; // under the address line
    y -= l.size + l.gap;
  }
  body += `ET\n0.6 w 50 ${ruleY} m 545 ${ruleY} l S\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}endstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((o, i) => { const at = Buffer.byteLength(pdf, 'latin1'); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function seedPatientRecords() {
  const conn = await db.getConnection();
  try {
    const [[done]] = await conn.query("SELECT COUNT(*) AS n FROM prescription_files WHERE name LIKE 'CareCure-Rx-%'");
    if (done.n > 0) { console.log('Patient records are already loaded. Nothing to do.'); return; }

    const [doctors] = await conn.query('SELECT d.id, d.user_id, d.specialization, d.fees, u.name FROM doctors d JOIN users u ON u.id = d.user_id');
    const [realPatients] = await conn.query("SELECT id, name, age, gender FROM users WHERE role = 'patient' AND email NOT LIKE ?", [`%@${DEMO_DOMAIN}`]);

    // Pick visit days and doctors first: their slots must exist before the transaction starts reading.
    const plans = realPatients.map((p) => ({
      p,
      past: Array.from({ length: int(7, 10) }, () => ({ doc: pick(doctors), offset: -int(3, 150) })),
      upcoming: Array.from({ length: 2 }, () => ({ doc: pick(doctors), offset: int(1, 10) })),
    }));
    for (const pl of plans) for (const v of [...pl.past, ...pl.upcoming]) await generateSlotsForDoctorDate(v.doc.id, dateStr(daysFrom(v.offset)));

    await conn.beginTransaction();
    let visits = 0;
    for (const { p, past, upcoming } of plans) {
      // Fill only what the account left empty.
      await conn.query(
        `UPDATE users SET age = COALESCE(age, ?), gender = COALESCE(gender, ?), city = COALESCE(NULLIF(city, ''), ?),
           medical_history = COALESCE(NULLIF(medical_history, ''), ?) WHERE id = ?`,
        [int(22, 45), chance(0.5) ? 'male' : 'female', 'Kolkata', pick(['Mild asthma since childhood', 'Allergic to sulfa drugs', 'Seasonal allergic rhinitis', 'Hypothyroidism, on Thyroxine 50 mcg']), p.id]
      );
      const [[{ up }]] = await conn.query(
        `SELECT COUNT(*) AS up FROM appointments a JOIN doctor_slots s ON s.id = a.slot_id
         WHERE a.patient_id = ? AND a.status = 'pending' AND TIMESTAMP(s.date, s.time) >= NOW()`, [p.id]
      );
      let upcomingLeft = Math.max(0, 5 - Number(up));
      const used = new Set();
      for (const v of [...past, ...upcoming]) {
        const future = v.offset > 0;
        const key = `${v.doc.id}:${v.offset}`;
        if (used.has(key) || (future && upcomingLeft === 0)) continue;
        const [[clash]] = await conn.query(
          `SELECT a.id FROM appointments a JOIN doctor_slots s ON s.id = a.slot_id
           WHERE a.patient_id = ? AND a.doctor_id = ? AND s.date = ? AND a.status <> 'cancelled'`, [p.id, v.doc.id, dateStr(daysFrom(v.offset))]
        );
        if (clash) continue;
        const [free] = await conn.query('SELECT id, time FROM doctor_slots WHERE doctor_id = ? AND date = ? AND is_booked = 0 AND is_available = 1', [v.doc.id, dateStr(daysFrom(v.offset))]);
        if (free.length === 0) continue;
        used.add(key);
        const slot = pick(free);
        const start = at(daysFrom(v.offset), slot.time);
        const status = future ? 'pending' : chance(0.1) ? 'cancelled' : 'completed';
        const video = chance(0.2);
        const paid = video || (status === 'completed' && chance(0.8)) || (future && chance(0.4));
        const rx = pick(RX[v.doc.specialization] || RX['General Medicine']);
        const booked = new Date(Math.min(start.getTime() - int(1, 6) * 86400000, Date.now() - 3600000));
        const [a] = await conn.query(
          `INSERT INTO appointments (patient_id, doctor_id, slot_id, active_slot_id, status, reason, consultation_type, video_room, payment_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, v.doc.id, slot.id, status === 'cancelled' ? null : slot.id, status, pick(REASONS[v.doc.specialization] || REASONS['General Medicine']),
            video ? 'video' : 'in_person', video ? `hms-${hex(16)}` : null, paid ? 'paid' : 'unpaid', sql(booked)]
        );
        visits += 1;
        if (future) upcomingLeft -= 1;
        if (status !== 'cancelled') await conn.query('UPDATE doctor_slots SET is_booked = 1 WHERE id = ?', [slot.id]);
        if (paid) {
          await conn.query(
            `INSERT INTO payments (appointment_id, patient_id, amount_paise, provider, provider_order_id, provider_payment_id, status, paid_at, created_at)
             VALUES (?, ?, ?, 'mock', ?, ?, ?, ?, ?)`,
            [a.insertId, p.id, Math.round(Number(v.doc.fees) * 100), `order_demo_${hex(10)}`, `pay_demo_${hex(10)}`,
              status === 'cancelled' ? 'refund_due' : 'paid', sql(new Date(booked.getTime() + 600000)), sql(booked)]
          );
        }
        if (status === 'completed') {
          await conn.query('INSERT INTO prescriptions (appointment_id, doctor_id, patient_id, notes, created_at) VALUES (?, ?, ?, ?, ?)',
            [a.insertId, v.doc.id, p.id, rxNotes(rx), sql(new Date(start.getTime() + 30 * 60000))]);
          if (chance(0.6)) {
            await conn.query('INSERT INTO ratings (appointment_id, doctor_id, patient_id, stars, created_at) VALUES (?, ?, ?, ?, ?)',
              [a.insertId, v.doc.id, p.id, weighted([[5, 55], [4, 35], [3, 10]]), sql(new Date(start.getTime() + 86400000))]);
          }
        }
      }
    }
    await conn.query(
      `UPDATE doctors d JOIN (SELECT doctor_id, ROUND(AVG(stars), 2) AS r, COUNT(*) AS c FROM ratings GROUP BY doctor_id) x
         ON x.doctor_id = d.id SET d.rating = x.r, d.rating_count = x.c`
    );

    // A prescription PDF for nearly every prescription without a file (some doctors only write notes).
    const [rxRows] = await conn.query(
      `SELECT p.id, p.notes, p.created_at, u.name AS patient, u.age, u.gender, du.name AS doctor, d.specialization,
              u.email LIKE ? AS demo
       FROM prescriptions p
       JOIN users u ON u.id = p.patient_id
       JOIN doctors d ON d.id = p.doctor_id
       JOIN users du ON du.id = d.user_id
       WHERE p.file_url IS NULL OR p.file_url LIKE '/uploads/%'`, [`%@${DEMO_DOMAIN}`]
    );
    let files = 0;
    for (const r of rxRows) {
      if (r.demo && chance(0.1)) continue;
      const created = new Date(r.created_at);
      const rxNo = `CC-${created.getFullYear()}-${String(r.id).padStart(5, '0')}`;
      const pdf = prescriptionPdf({
        doctor: r.doctor, specialization: r.specialization, patient: r.patient, age: r.age, gender: r.gender,
        date: created.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), notes: r.notes || '', rxNo,
      });
      await conn.query('INSERT INTO prescription_files (prescription_id, mime, name, size_bytes, data) VALUES (?, ?, ?, ?, ?)',
        [r.id, 'application/pdf', `CareCure-Rx-${rxNo}.pdf`, pdf.length, pdf]);
      await conn.query('UPDATE prescriptions SET file_url = ? WHERE id = ?', [`/api/files/prescriptions/${r.id}`, r.id]);
      files += 1;
    }

    await conn.commit();
    console.log(`✅ Patient records loaded: ${visits} visits for ${realPatients.length} existing patients, ${files} prescription PDFs.`);
  } catch (err) {
    try { await conn.rollback(); } catch { /* not in a transaction yet */ }
    throw err;
  } finally {
    conn.release();
  }
}

main()
  .then(seedPatientRecords)
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Demo seed failed:', err.message); process.exit(1); });
