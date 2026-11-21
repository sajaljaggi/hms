const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { listNotifications, markRead, markAllRead } = require('../controllers/notificationController');
const { listNotificationsQuerySchema, notificationIdParamsSchema } = require('../validators/notificationValidators');

router.use(auth);
router.get('/', validate(listNotificationsQuerySchema, 'query'), listNotifications);
router.patch('/read-all', markAllRead); // must stay before /:id/read
router.patch('/:id/read', validate(notificationIdParamsSchema, 'params'), markRead);

module.exports = router;
