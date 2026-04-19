require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const cron    = require('node-cron');
const { addDays, format } = require('date-fns');

// Route files
const authRoutes        = require('./routes/authRoutes');
const patientRoutes     = require('./routes/patientRoutes');
const doctorRoutes      = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const adminRoutes       = require('./routes/adminRoutes');
const chatbotRoutes     = require('./routes/chatbotRoutes');
const morgan            = require('morgan');

// Error handler middleware
const errorHandler = require('./middleware/errorHandler');

// DB + slot generator
const db = require('./config/db');
const { generateSlotsForAllDoctors } = require('./utils/generateSlots');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Global Middleware ────────────────────────────────────────────────────────
app.use(morgan('dev'));
app.use(cors({
  origin: 'http://localhost:5173', // Vite dev server
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (prescriptions) as static assets
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor',  doctorRoutes);
app.use('/api',         appointmentRoutes); // /api/doctors, /api/slots, /api/appointments/book
app.use('/api/admin',   adminRoutes);
app.use('/api/chatbot', chatbotRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'HMS API is running 🚀', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found.` });
});

// Global error handler (must be last)
app.use(errorHandler);

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
