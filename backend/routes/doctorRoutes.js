const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
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

// Multer config: store prescription files in uploads/
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    ext ? cb(null, true) : cb(new Error('Only JPEG, PNG, and PDF files are allowed.'));
  },
});

// All routes require: JWT + doctor role
router.use(auth, requireRole('doctor'));

router.get('/appointments',       validate(getAppointmentsQuerySchema, 'query'), getAppointments);           // GET  /api/doctor/appointments
router.get('/dashboard',          getDashboardStats);         // GET  /api/doctor/dashboard
router.put('/appointment-status', validate(updateAppointmentStatusSchema), updateAppointmentStatus);   // PUT  /api/doctor/appointment-status
router.post('/prescription',      upload.single('file'), validate(createPrescriptionSchema), createPrescription); // POST /api/doctor/prescription
router.post('/slots',             validate(createSlotsSchema), createSlots);               // POST /api/doctor/slots

module.exports = router;
