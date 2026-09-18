require('dotenv').config();
const cron = require('node-cron');
const { addDays, format } = require('date-fns');

const app = require('./app');
const db  = require('./config/db');
const { generateSlotsForAllDoctors } = require('./utils/generateSlots');

const PORT = process.env.PORT || 5000;

// ── Slot Generation Helpers ───────────────────────────────────────────────────
/**
 * Generate slots for every doctor for the next N days from today.
 */
async function generateRollingSlots(days = 14) {
  const today = new Date();
  const dates = Array.from({ length: days }, (_, i) =>
    format(addDays(today, i), 'yyyy-MM-dd')
  );
  for (const date of dates) {
    await generateSlotsForAllDoctors(date);
  }
  console.log(`✅ Slots generated for next ${days} days.`);
}

/**
 * Remove past unbooked slots to keep the table lean.
 */
async function cleanupPastSlots() {
  const [result] = await db.query(
    'DELETE FROM doctor_slots WHERE date < CURDATE() AND is_booked = 0'
  );
  console.log(`🧹 Cleaned up ${result.affectedRows} old unbooked slots.`);
}

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🏥 HMS Backend running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health\n`);

  try {
    // On startup: clean past slots + pre-generate next 14 days
    await cleanupPastSlots();
    await generateRollingSlots(14);
  } catch (err) {
    console.error('⚠️  Startup slot generation error:', err.message);
  }
});

// ── Daily Cron: midnight every day ───────────────────────────────────────────
// Generates slots for the next 14 days so the rolling window stays populated
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ Cron: generating daily slots...');
  try {
    await cleanupPastSlots();
    await generateRollingSlots(14);
  } catch (err) {
    console.error('⚠️  Cron slot generation error:', err.message);
  }
});
