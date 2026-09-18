const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
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

// All routes require: JWT + admin role
router.use(auth, requireRole('admin'));

router.get('/users',                    getAllUsers);         // GET    /api/admin/users
router.get('/doctors',                  getAllDoctors);       // GET    /api/admin/doctors
router.post('/doctors',                 doctorImageUpload.single('profileImage'), createDoctor);  // POST   /api/admin/doctors
router.get('/appointments',             getAllAppointments);  // GET    /api/admin/appointments
router.delete('/user/:id',              deleteUser);          // DELETE /api/admin/user/:id
router.patch('/users/:id',              updateUser);          // PATCH  /api/admin/users/:id
router.patch('/doctors/:id',            doctorImageUpload.single('profileImage'), updateDoctor);  // PATCH  /api/admin/doctors/:id
router.delete('/appointments/:id',      deleteAppointment);   // DELETE /api/admin/appointments/:id
router.patch('/appointments/:id',       updateAppointment);   // PATCH  /api/admin/appointments/:id

// Slot management
router.get('/slots',                    getAdminSlots);       // GET    /api/admin/slots?doctorId=&date=
router.patch('/slots/:slotId/toggle',   toggleSlot);          // PATCH  /api/admin/slots/:slotId/toggle
router.delete('/slots/day',             blockDay);            // DELETE /api/admin/slots/day
router.post('/slots/generate',          generateSlotsAdmin);  // POST   /api/admin/slots/generate

module.exports = router;
