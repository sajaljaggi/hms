const express = require('express');
const router  = express.Router();
const { register, login } = require('../controllers/authController');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const { registerSchema, loginSchema } = require('../validators/authValidators');

// POST /api/auth/register  (patient self-registration)
router.post('/register', authLimiter, validate(registerSchema), register);

// POST /api/auth/login  (all roles)
router.post('/login', authLimiter, validate(loginSchema), login);

module.exports = router;
