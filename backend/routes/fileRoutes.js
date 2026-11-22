const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { idParamsSchema } = require('../validators/adminValidators');
const c = require('../controllers/fileController');

router.get('/doctors/:id/image', validate(idParamsSchema, 'params'), c.getDoctorImage);
router.get('/prescriptions/:id', auth, validate(idParamsSchema, 'params'), c.getPrescriptionFile);

module.exports = router;
