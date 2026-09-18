const express = require('express');
const router  = express.Router();
const { register, login, refresh, logout, me } = require('../controllers/authController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const { registerSchema, loginSchema } = require('../validators/authValidators');

// POST /api/auth/register  (patient self-registration)
router.post('/register', authLimiter, validate(registerSchema), register);

// POST /api/auth/login  (all roles)
router.post('/login', authLimiter, validate(loginSchema), login);

// POST /api/auth/refresh  (reads refresh_token cookie, reissues access+refresh)
router.post('/refresh', refresh);

// POST /api/auth/logout  (clears both auth cookies)
router.post('/logout', logout);

// GET /api/auth/me  (restore session on app load)
router.get('/me', auth, me);

module.exports = router;
