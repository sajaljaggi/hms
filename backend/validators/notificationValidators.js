const { z } = require('zod');
const { idParam } = require('./common');

const listNotificationsQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const notificationIdParamsSchema = z.object({ id: idParam });

module.exports = { listNotificationsQuerySchema, notificationIdParamsSchema };
