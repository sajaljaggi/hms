const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const morgan  = require('morgan');

// Route files
const authRoutes        = require('./routes/authRoutes');
const patientRoutes     = require('./routes/patientRoutes');
const doctorRoutes      = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const adminRoutes       = require('./routes/adminRoutes');
const chatbotRoutes     = require('./routes/chatbotRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const bedRoutes = require('./routes/bedRoutes');
const bloodBankRoutes = require('./routes/bloodBankRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const teleconsultRoutes = require('./routes/teleconsultRoutes');
const navigationRoutes = require('./routes/navigationRoutes');
const fileRoutes = require('./routes/fileRoutes');

// Error handler middleware
const errorHandler = require('./middleware/errorHandler');
const { NotFoundError } = require('./utils/errors');
const { issueCsrfToken, verifyCsrf } = require('./middleware/csrf');
const db = require('./config/db');

const app = express();

// Render sits in front of the app behind a reverse proxy. Without this,
// req.ip resolves to the proxy's address for every request — identical for
// every visitor — so express-rate-limit (keyed on req.ip below) ends up
// sharing one rate-limit bucket across all users instead of one per real
// client, tripping "too many requests" from aggregate traffic. `1` trusts
// exactly one hop (Render's own proxy) and reads the real client IP from
// X-Forwarded-For.
// Proxy hops in front of the app. 1 = Render only (its default here). Behind Vercel's /api rewrite there are
// two (Vercel, then Render): set TRUST_PROXY_HOPS=2 there, or every visitor shares Vercel's IP for rate limits.
// Check from the logs: a rate-limited request prints the ip it saw and the x-forwarded-for chain.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

// ── Global Middleware ────────────────────────────────────────────────────────
app.disable('x-powered-by');
// Basic hardening headers on every API response (the API is never meant to be framed or sniffed).
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...(process.env.NODE_ENV === 'production' && { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }),
  });
  next();
});
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true, // required for the browser to send/receive the auth cookies
}));
app.use(cookieParser());
// The Razorpay webhook HMAC is over the exact raw bytes, so this path must get a Buffer, not parsed JSON.
// express.json() skips a body that was already read here.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CSRF: issue the readable csrf_token cookie on every request, then require
// it to be echoed back in a header on any state-changing one.
app.use(issueCsrfToken);
app.use(verifyCsrf);


// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor',  doctorRoutes);
app.use('/api',         appointmentRoutes); // /api/doctors, /api/slots, /api/appointments/book
app.use('/api/admin',   adminRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/beds', bedRoutes);
app.use('/api/blood', bloodBankRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/teleconsult', teleconsultRoutes);
app.use('/api/navigation', navigationRoutes);
app.use('/api/files', fileRoutes);

// Health check — also queries the DB (not just a liveness ping) so it
// doubles as the target for the keep-alive workflow: free-tier managed
// MySQL hosts (e.g. Aiven) pause on lack of *database query* activity, not
// just HTTP traffic. Always returns 200 so this can still serve as Render's
// shallow health check without flapping on a transient DB hiccup — the
// `database` field is what a keep-alive ping or deeper monitor should read.
app.get('/api/health', async (req, res) => {
  let database = 'connected';
  try {
    await db.query('SELECT 1');
  } catch {
    database = 'disconnected';
  }
  res.json({ success: true, message: 'HMS API is running 🚀', timestamp: new Date().toISOString(), database });
});

// 404 handler
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found.`));
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
