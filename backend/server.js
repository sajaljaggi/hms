require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

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

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏥 HMS Backend running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health\n`);
});
