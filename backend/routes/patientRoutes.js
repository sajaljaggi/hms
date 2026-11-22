const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate     = require('../middleware/validate');
const {
  getProfile,
  updateProfile,
  getAppointments,
  getMedicalHistory,
  submitRating,
  cancelMyAppointment,
} = require('../controllers/patientController');
const { idParamsSchema } = require('../validators/adminValidators');
const { updateProfileSchema, submitRatingSchema } = require('../validators/patientValidators');

// All routes require: JWT + patient role
router.use(auth, requireRole('patient'));

router.get('/profile',        getProfile);        // GET  /api/patient/profile
router.put('/profile',        validate(updateProfileSchema), updateProfile);      // PUT  /api/patient/profile
router.get('/appointments',   getAppointments);    // GET  /api/patient/appointments
router.get('/medical-history',getMedicalHistory);  // GET  /api/patient/medical-history
router.post('/appointments/:id/cancel', validate(idParamsSchema, 'params'), cancelMyAppointment); // POST /api/patient/appointments/:id/cancel
router.post('/rate',          validate(submitRatingSchema), submitRating);       // POST /api/patient/rate

module.exports = router;
