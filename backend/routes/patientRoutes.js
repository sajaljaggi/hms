const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const {
  getProfile,
  updateProfile,
  getAppointments,
  getMedicalHistory,
  submitRating,
} = require('../controllers/patientController');

// All routes require: JWT + patient role
router.use(auth, requireRole('patient'));

router.get('/profile',        getProfile);        // GET  /api/patient/profile
router.put('/profile',        updateProfile);      // PUT  /api/patient/profile
router.get('/appointments',   getAppointments);    // GET  /api/patient/appointments
router.get('/medical-history',getMedicalHistory);  // GET  /api/patient/medical-history
router.post('/rate',          submitRating);       // POST /api/patient/rate

module.exports = router;
