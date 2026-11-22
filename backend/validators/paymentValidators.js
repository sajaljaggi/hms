const { z } = require('zod');
const { idParam } = require('./common');

const providerId = z.string().trim().regex(/^[A-Za-z0-9_]{1,64}$/);

const createOrderSchema = z.object({ appointmentId: idParam });

const verifySchema = z.object({
  orderId: providerId,
  paymentId: providerId,
  signature: z.string().trim().regex(/^[a-f0-9]{1,128}$/i),
});

const orderIdParamsSchema = z.object({ orderId: providerId });

const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

module.exports = { createOrderSchema, verifySchema, orderIdParamsSchema, listPaymentsQuerySchema };
