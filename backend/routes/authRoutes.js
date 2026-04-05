const express = require('express');
const router  = express.Router();
const { register, login } = require('../controllers/authController');

// POST /api/auth/register  (patient self-registration)
router.post('/register', register);

// POST /api/auth/login  (all roles)
router.post('/login', login);

module.exports = router;
