const express = require('express');
const router  = express.Router();
const { prescriptionUpload } = require('../middleware/upload');
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate     = require('../middleware/validate');
const {
  getAppointments,
  updateAppointmentStatus,
  createPrescription,
  createSlots,
  getDashboardStats,
} = require('../controllers/doctorController');
const {
  getAppointmentsQuerySchema,
  updateAppointmentStatusSchema,
  createPrescriptionSchema,
  createSlotsSchema,
} = require('../validators/doctorValidators');

// All routes require: JWT + doctor role
router.use(auth, requireRole('doctor'));

router.get('/appointments',       validate(getAppointmentsQuerySchema, 'query'), getAppointments);           // GET  /api/doctor/appointments
router.get('/dashboard',          getDashboardStats);         // GET  /api/doctor/dashboard
router.put('/appointment-status', validate(updateAppointmentStatusSchema), updateAppointmentStatus);   // PUT  /api/doctor/appointment-status
router.post('/prescription',      prescriptionUpload, validate(createPrescriptionSchema), createPrescription); // POST /api/doctor/prescription
router.post('/slots',             validate(createSlotsSchema), createSlots);               // POST /api/doctor/slots

module.exports = router;
