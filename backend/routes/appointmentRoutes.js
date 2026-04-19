const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const {
  getDoctors,
  getAvailableSlots,
  bookAppointment,
} = require('../controllers/appointmentController');
const { submitRating, checkRating } = require('../controllers/ratingController');

// Public routes (no auth needed to browse doctors/slots)
router.get('/doctors', getDoctors);            // GET /api/doctors?specialization=
router.get('/slots',   getAvailableSlots);     // GET /api/slots?doctorId=&date=

// Protected: only patients can book
router.post('/appointments/book', auth, requireRole('patient'), bookAppointment); // POST /api/appointments/book

// Ratings (patient only)
router.post('/ratings',                    auth, requireRole('patient'), submitRating);  // POST /api/ratings
router.get('/ratings/check/:appointmentId', auth, requireRole('patient'), checkRating); // GET  /api/ratings/check/:id

module.exports = router;
