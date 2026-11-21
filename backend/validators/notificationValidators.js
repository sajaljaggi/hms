const { z } = require('zod');
const { idParam } = require('./common');

const listNotificationsQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const notificationIdParamsSchema = z.object({ id: idParam });

module.exports = { listNotificationsQuerySchema, notificationIdParamsSchema };
