const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate = require('../middleware/validate');
const c = require('../controllers/navigationController');
const v = require('../validators/navigationValidators');

const admin = [auth, requireRole('admin')];

// Public: visitors can find their way without logging in
router.get('/locations', validate(v.listLocationsQuerySchema, 'query'), c.listLocations);
router.get('/route', validate(v.routeQuerySchema, 'query'), c.getRoute);

router.post('/locations', ...admin, validate(v.createLocationSchema), c.createLocation);
router.delete('/locations/:id', ...admin, validate(v.idParamsSchema, 'params'), c.deleteLocation);
router.post('/edges', ...admin, validate(v.createEdgeSchema), c.createEdge);
router.delete('/edges/:id', ...admin, validate(v.idParamsSchema, 'params'), c.deleteEdge);

module.exports = router;
