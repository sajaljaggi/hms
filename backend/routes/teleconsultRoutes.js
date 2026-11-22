const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate = require('../middleware/validate');
const c = require('../controllers/teleconsultController');
const v = require('../validators/teleconsultValidators');

router.use(auth, requireRole('patient', 'doctor'));
router.get('/:appointmentId/join', validate(v.appointmentIdParamsSchema, 'params'), c.join);
router.patch('/:appointmentId/complete', requireRole('doctor'), validate(v.appointmentIdParamsSchema, 'params'), c.complete);

module.exports = router;
