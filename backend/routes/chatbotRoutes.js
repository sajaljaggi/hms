const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const {
  sendMessage,
  getChatbotDoctors,
  getChatbotSlots,
  chatbotBook,
  getPatientAppointments,
} = require('../controllers/chatbotController');

// Public routes (no auth needed to chat or browse)
router.post('/message', sendMessage);                          // POST /api/chatbot/message
router.get('/doctors',  getChatbotDoctors);                    // GET  /api/chatbot/doctors?specialization=
router.get('/slots',    getChatbotSlots);                      // GET  /api/chatbot/slots?doctorId=&date=

// Protected: only logged-in patients can book or view appointments via chatbot
router.post('/book', auth, requireRole('patient'), chatbotBook);                  // POST /api/chatbot/book
router.get('/appointments', auth, requireRole('patient'), getPatientAppointments); // GET  /api/chatbot/appointments?filter=

module.exports = router;
