const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const validate = require('../middleware/validate');
const c = require('../controllers/paymentController');
const v = require('../validators/paymentValidators');

// Razorpay calls this directly: no session, authenticated by the webhook HMAC (raw body set up in app.js).
router.post('/webhook', c.webhook);

router.use(auth);
router.post('/orders', requireRole('patient'), validate(v.createOrderSchema), c.createOrder);
router.post('/verify', requireRole('patient'), validate(v.verifySchema), c.verifyPayment);
router.post('/orders/:orderId/fail', requireRole('patient'), validate(v.orderIdParamsSchema, 'params'), c.failOrder);
router.get('/my', requireRole('patient'), c.myPayments);
router.get('/', requireRole('admin'), c.listPayments);

module.exports = router;
