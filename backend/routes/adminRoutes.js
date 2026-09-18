const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate     = require('../middleware/validate');
const { doctorImageUpload } = require('../middleware/upload');
const {
  getAllUsers,
  getAllDoctors,
  getAllAppointments,
  deleteUser,
  createDoctor,
  getAdminSlots,
  toggleSlot,
  blockDay,
  generateSlotsAdmin,
  updateUser,
  updateDoctor,
  deleteAppointment,
  updateAppointment,
} = require('../controllers/adminController');
const {
  idParamsSchema,
  slotIdParamsSchema,
  createDoctorSchema,
  updateDoctorSchema,
  updateUserSchema,
  updateAppointmentSchema,
  adminSlotsQuerySchema,
  blockDaySchema,
  generateSlotsSchema,
} = require('../validators/adminValidators');

// All routes require: JWT + admin role
router.use(auth, requireRole('admin'));

router.get('/users',                    getAllUsers);         // GET    /api/admin/users
router.get('/doctors',                  getAllDoctors);       // GET    /api/admin/doctors
router.post('/doctors',                 doctorImageUpload.single('profileImage'), validate(createDoctorSchema), createDoctor);  // POST   /api/admin/doctors
router.get('/appointments',             getAllAppointments);  // GET    /api/admin/appointments
router.delete('/user/:id',              validate(idParamsSchema, 'params'), deleteUser);          // DELETE /api/admin/user/:id
router.patch('/users/:id',              validate(idParamsSchema, 'params'), validate(updateUserSchema), updateUser);          // PATCH  /api/admin/users/:id
router.patch('/doctors/:id',            doctorImageUpload.single('profileImage'), validate(idParamsSchema, 'params'), validate(updateDoctorSchema), updateDoctor);  // PATCH  /api/admin/doctors/:id
router.delete('/appointments/:id',      validate(idParamsSchema, 'params'), deleteAppointment);   // DELETE /api/admin/appointments/:id
router.patch('/appointments/:id',       validate(idParamsSchema, 'params'), validate(updateAppointmentSchema), updateAppointment);   // PATCH  /api/admin/appointments/:id

// Slot management
router.get('/slots',                    validate(adminSlotsQuerySchema, 'query'), getAdminSlots);       // GET    /api/admin/slots?doctorId=&date=
router.patch('/slots/:slotId/toggle',   validate(slotIdParamsSchema, 'params'), toggleSlot);          // PATCH  /api/admin/slots/:slotId/toggle
router.delete('/slots/day',             validate(blockDaySchema), blockDay);            // DELETE /api/admin/slots/day
router.post('/slots/generate',          validate(generateSlotsSchema), generateSlotsAdmin);  // POST   /api/admin/slots/generate

module.exports = router;
