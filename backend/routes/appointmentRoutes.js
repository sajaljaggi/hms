const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate     = require('../middleware/validate');
const {
  getDoctors,
  getAvailableSlots,
  bookAppointment,
} = require('../controllers/appointmentController');
const {
  getDoctorsQuerySchema,
  getSlotsQuerySchema,
  bookAppointmentSchema,
} = require('../validators/appointmentValidators');

// Public routes (no auth needed to browse doctors/slots)
router.get('/doctors', validate(getDoctorsQuerySchema, 'query'), getDoctors);  // GET /api/doctors?specialization=
router.get('/slots',   validate(getSlotsQuerySchema, 'query'), getAvailableSlots); // GET /api/slots?doctorId=&date=

// Protected: only patients can book
router.post('/appointments/book', auth, requireRole('patient'), validate(bookAppointmentSchema), bookAppointment); // POST /api/appointments/book

module.exports = router;
