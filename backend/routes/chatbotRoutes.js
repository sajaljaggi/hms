const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate     = require('../middleware/validate');
const { chatbotLimiter } = require('../middleware/rateLimiter');
const {
  sendMessage,
  getChatbotDoctors,
  getChatbotSlots,
  chatbotBook,
  getPatientAppointments,
} = require('../controllers/chatbotController');
const {
  sendMessageSchema,
  chatbotDoctorsQuerySchema,
  chatbotSlotsQuerySchema,
  chatbotBookSchema,
  patientAppointmentsQuerySchema,
} = require('../validators/chatbotValidators');

// Public routes (no auth needed to chat or browse)
router.post('/message', chatbotLimiter, validate(sendMessageSchema), sendMessage);                          // POST /api/chatbot/message
router.get('/doctors',  validate(chatbotDoctorsQuerySchema, 'query'), getChatbotDoctors);                    // GET  /api/chatbot/doctors?specialization=
router.get('/slots',    validate(chatbotSlotsQuerySchema, 'query'), getChatbotSlots);                    // GET  /api/chatbot/slots?doctorId=&date=

// Protected: only logged-in patients can book or view appointments via chatbot
router.post('/book', auth, requireRole('patient'), validate(chatbotBookSchema), chatbotBook);                  // POST /api/chatbot/book
router.get('/appointments', auth, requireRole('patient'), validate(patientAppointmentsQuerySchema, 'query'), getPatientAppointments); // GET  /api/chatbot/appointments?filter=

module.exports = router;
