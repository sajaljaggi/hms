const express = require('express');
const router  = express.Router();
const auth        = require('../middleware/auth');
const requireRole = require('../middleware/role');
const {
  getAllUsers,
  getAllDoctors,
  getAllAppointments,
  deleteUser,
  createDoctor,
} = require('../controllers/adminController');

// All routes require: JWT + admin role
router.use(auth, requireRole('admin'));

router.get('/users',        getAllUsers);        // GET    /api/admin/users
router.get('/doctors',      getAllDoctors);      // GET    /api/admin/doctors
router.post('/doctors',     createDoctor);       // POST   /api/admin/doctors
router.get('/appointments', getAllAppointments); // GET    /api/admin/appointments
router.delete('/user/:id',  deleteUser);         // DELETE /api/admin/user/:id

module.exports = router;
