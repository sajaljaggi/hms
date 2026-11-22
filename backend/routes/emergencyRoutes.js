const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate = require('../middleware/validate');
const c = require('../controllers/emergencyController');
const v = require('../validators/emergencyValidators');

router.use(auth, requireRole('admin', 'doctor'));
router.get('/stats', c.stats);
router.post('/cases', validate(v.createCaseSchema), c.createCase);
router.get('/cases', validate(v.listCasesQuerySchema, 'query'), c.listCases);
router.get('/cases/:id', validate(v.idParamsSchema, 'params'), c.getCase);
router.patch('/cases/:id', validate(v.idParamsSchema, 'params'), validate(v.updateCaseSchema), c.updateCase);
router.post('/cases/:id/admit', validate(v.idParamsSchema, 'params'), validate(v.admitSchema), c.admit);

module.exports = router;
