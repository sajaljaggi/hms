const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate = require('../middleware/validate');
const c = require('../controllers/bloodBankController');
const v = require('../validators/bloodBankValidators');

const staff = requireRole('admin', 'doctor');
const admin = requireRole('admin');
const id = validate(v.idParamsSchema, 'params');

router.use(auth);
router.get('/inventory', staff, c.inventory);
router.get('/donors', admin, validate(v.listDonorsQuerySchema, 'query'), c.listDonors);
router.post('/donors', admin, validate(v.createDonorSchema), c.createDonor);
router.post('/donations', admin, validate(v.donationSchema), c.donate);
router.get('/units', admin, validate(v.listUnitsQuerySchema, 'query'), c.listUnits);
router.patch('/units/:id/discard', admin, id, c.discardUnit);
router.post('/requests', staff, validate(v.createRequestSchema), c.createRequest);
router.get('/requests', staff, validate(v.listRequestsQuerySchema, 'query'), c.listRequests);
router.post('/requests/:id/fulfill', admin, id, c.fulfill);
router.patch('/requests/:id/reject', admin, id, validate(v.rejectSchema), c.reject);
// Requester-or-admin is enforced in the service (doctors may only cancel their own).
router.patch('/requests/:id/cancel', staff, id, c.cancel);

module.exports = router;
