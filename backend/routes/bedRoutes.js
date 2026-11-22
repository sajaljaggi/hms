const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate = require('../middleware/validate');
const c = require('../controllers/bedController');
const v = require('../validators/bedValidators');

const r = require('../controllers/bedRequestController');

const staff = requireRole('admin', 'doctor');
const admin = requireRole('admin');
const doctor = requireRole('doctor');
const id = validate(v.idParamsSchema, 'params');

// Doctors see availability and request beds or discharges; only the admin assigns and discharges.
router.use(auth);
// Fixed paths first, so they are not captured by /:id
router.get('/wards', staff, c.listWards);
router.post('/wards', admin, validate(v.createWardSchema), c.createWard);
router.get('/stats', staff, c.stats);
router.get('/patients/search', staff, validate(v.patientSearchQuerySchema, 'query'), c.searchPatients);
router.get('/my-patients', doctor, r.myPatients);
router.get('/requests', staff, validate(v.listBedRequestsQuerySchema, 'query'), r.listRequests);
router.post('/requests', doctor, validate(v.createBedRequestSchema), r.createRequest);
router.post('/requests/:id/fulfill', admin, id, validate(v.fulfillBedRequestSchema), r.fulfill);
router.patch('/requests/:id/reject', admin, id, validate(v.rejectBedRequestSchema), r.reject);
router.patch('/requests/:id/cancel', staff, id, r.cancel);
router.post('/allocations/:id/discharge', admin, id, c.discharge);
router.get('/', admin, validate(v.listBedsQuerySchema, 'query'), c.listBeds);
router.post('/', admin, validate(v.createBedSchema), c.createBed);
router.patch('/:id/status', admin, id, validate(v.bedStatusSchema), c.updateBedStatus);
router.post('/:id/allocate', admin, id, validate(v.allocateBedSchema), c.allocate);

module.exports = router;
