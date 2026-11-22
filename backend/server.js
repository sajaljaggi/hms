require('dotenv').config();
const cron = require('node-cron');

const app = require('./app');
const { generateRollingSlots, cleanupPastSlots } = require('./utils/generateSlots');

const PORT = process.env.PORT || 5000;

// ── Slot maintenance ─────────────────────────────────────────────────────────
// Separate try blocks: a failed cleanup must never stop the next 14 days of slots being generated.
async function maintainSlots(when) {
  try {
    console.log(`🧹 Cleaned up ${await cleanupPastSlots()} old unbooked slots.`);
  } catch (err) {
    console.error(`⚠️  ${when} slot cleanup error:`, err.message);
  }
  try {
    console.log(`✅ Slots generated for next ${await generateRollingSlots(14)} days.`);
  } catch (err) {
    console.error(`⚠️  ${when} slot generation error:`, err.message);
  }
}

// ── Start Server ──────────────────────────────────────────────────────────────
// Express 5 hands listen errors (e.g. EADDRINUSE) to this callback instead of throwing,
// so without this check the process stays up, serving nothing, after printing "running".
app.listen(PORT, async (err) => {
  if (err) {
    console.error(`❌ Could not listen on port ${PORT}: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
      console.error('   Another process holds this port. On macOS, AirPlay Receiver uses 5000; set PORT=5001 in backend/.env.');
    }
    process.exit(1);
  }
  console.log(`\n🏥 HMS Backend running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health\n`);

  await maintainSlots('Startup');
});

// ── Daily Cron: midnight every day ───────────────────────────────────────────
// Generates slots for the next 14 days so the rolling window stays populated
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ Cron: generating daily slots...');
  await maintainSlots('Cron');
});
