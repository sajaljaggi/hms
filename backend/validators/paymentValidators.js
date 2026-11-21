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

module.exports = { createOrderSchema, verifySchema, orderIdParamsSchema };
