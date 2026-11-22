const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate     = require('../middleware/validate');
const { chatbotLimiter } = require('../middleware/rateLimiter');
const { sendMessage, getPatientAppointments } = require('../controllers/chatbotController');
const { sendMessageSchema, patientAppointmentsQuerySchema } = require('../validators/chatbotValidators');

// Public: chatting. Doctors, slots and booking use the normal /api/doctors, /api/slots and /api/appointments/book.
router.post('/message', chatbotLimiter, validate(sendMessageSchema), sendMessage);                          // POST /api/chatbot/message

// Protected: only logged-in patients can view their appointments via chatbot
router.get('/appointments', auth, requireRole('patient'), validate(patientAppointmentsQuerySchema, 'query'), getPatientAppointments); // GET  /api/chatbot/appointments?filter=

module.exports = router;
