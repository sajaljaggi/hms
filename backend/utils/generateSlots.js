// backend/utils/generateSlots.js
// Idempotent 15-minute slot generator: 09:00 – 16:45 (32 slots per day)

const { addDays, format } = require('date-fns');
const db = require('../config/db');

/**
 * Pads a number to two digits: 9 → "09"
 */
const pad = n => String(n).padStart(2, '0');

/**
 * Returns an array of "HH:MM:SS" strings from 09:00 to 16:45 in 15-min steps.
 */
function buildTimeSlots() {
  const slots = [];
  for (let hour = 9; hour < 17; hour++) {
    for (let min = 0; min < 60; min += 15) {
      slots.push(`${pad(hour)}:${pad(min)}:00`);
    }
  }
  return slots; // 32 slots
}

/**
 * Generate slots for a single doctor on a single date.
 * Uses INSERT IGNORE so running multiple times is safe.
 *
 * @param {number} doctorId
 * @param {string} date  — "YYYY-MM-DD"
 */
async function generateSlotsForDoctorDate(doctorId, date) {
  const times = buildTimeSlots();
  const values = times.map(time => [doctorId, date, time, 0, 1]);

  await db.query(
    `INSERT IGNORE INTO doctor_slots (doctor_id, date, time, is_booked, is_available)
     VALUES ?`,
    [values]
  );
}

/**
 * Generate slots for ALL doctors for a given date.
 *
 * @param {string} date — "YYYY-MM-DD"
 */
async function generateSlotsForAllDoctors(date) {
  const [doctors] = await db.query('SELECT id FROM doctors');
  await Promise.all(doctors.map(d => generateSlotsForDoctorDate(d.id, date)));
}

/**
 * Generate slots for every doctor for the next N days from today.
 */
async function generateRollingSlots(days = 14) {
  const today = new Date();
  for (let i = 0; i < days; i++) await generateSlotsForAllDoctors(format(addDays(today, i), 'yyyy-MM-dd'));
  return days;
}

/**
 * Remove past slots nobody booked, to keep the table lean. A slot that any appointment points to stays,
 * even if it is free now: a cancelled visit frees its slot, and deleting the slot would delete the visit
 * (and fail outright when that visit has a payment record).
 */
async function cleanupPastSlots() {
  const [result] = await db.query(
    `DELETE s FROM doctor_slots s
     WHERE s.date < CURDATE() AND s.is_booked = 0
       AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.slot_id = s.id)`
  );
  return result.affectedRows;
}

module.exports = { generateSlotsForDoctorDate, generateSlotsForAllDoctors, generateRollingSlots, cleanupPastSlots };
