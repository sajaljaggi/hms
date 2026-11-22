const { z } = require('zod');
const { emptyToUndefined } = require('./common');

const historyMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

const sendMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message is required.').max(2000),
  history: z.array(historyMessageSchema).max(50).optional().default([]),
});

const patientAppointmentsQuerySchema = z.object({
  filter: emptyToUndefined(z.enum(['upcoming', 'past', 'all']).optional()),
});

module.exports = {
  sendMessageSchema,
  patientAppointmentsQuerySchema,
};
