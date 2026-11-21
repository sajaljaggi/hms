const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate = require('../middleware/validate');
const c = require('../controllers/bedController');
const v = require('../validators/bedValidators');

const staff = requireRole('admin', 'doctor');
const admin = requireRole('admin');

router.use(auth);
// Fixed paths first, so they are not captured by /:id
router.get('/wards', staff, c.listWards);
router.post('/wards', admin, validate(v.createWardSchema), c.createWard);
router.get('/stats', staff, c.stats);
router.get('/patients/search', staff, validate(v.patientSearchQuerySchema, 'query'), c.searchPatients);
router.post('/allocations/:id/discharge', staff, validate(v.idParamsSchema, 'params'), c.discharge);
router.get('/', staff, validate(v.listBedsQuerySchema, 'query'), c.listBeds);
router.post('/', admin, validate(v.createBedSchema), c.createBed);
router.patch('/:id/status', admin, validate(v.idParamsSchema, 'params'), validate(v.bedStatusSchema), c.updateBedStatus);
router.post('/:id/allocate', staff, validate(v.idParamsSchema, 'params'), validate(v.allocateBedSchema), c.allocate);

module.exports = router;
