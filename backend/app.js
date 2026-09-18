const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const path    = require('path');
const morgan  = require('morgan');

// Route files
const authRoutes        = require('./routes/authRoutes');
const patientRoutes     = require('./routes/patientRoutes');
const doctorRoutes      = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const adminRoutes       = require('./routes/adminRoutes');
const chatbotRoutes     = require('./routes/chatbotRoutes');

// Error handler middleware
const errorHandler = require('./middleware/errorHandler');
const { NotFoundError } = require('./utils/errors');
const { issueCsrfToken, verifyCsrf } = require('./middleware/csrf');

const app = express();

// ── Global Middleware ────────────────────────────────────────────────────────
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true, // required for the browser to send/receive the auth cookies
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CSRF: issue the readable csrf_token cookie on every request, then require
// it to be echoed back in a header on any state-changing one.
app.use(issueCsrfToken);
app.use(verifyCsrf);

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
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found.`));
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
