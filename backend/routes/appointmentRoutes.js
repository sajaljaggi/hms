const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const {
  getDoctors,
  getAvailableSlots,
  bookAppointment,
} = require('../controllers/appointmentController');

// Public routes (no auth needed to browse doctors/slots)
router.get('/doctors', getDoctors);            // GET /api/doctors?specialization=
router.get('/slots',   getAvailableSlots);     // GET /api/slots?doctorId=&date=

// Protected: only patients can book
router.post('/appointments/book', auth, requireRole('patient'), bookAppointment); // POST /api/appointments/book

module.exports = router;
