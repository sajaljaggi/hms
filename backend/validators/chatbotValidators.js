const { z } = require('zod');
const { emptyToUndefined, idParam } = require('./common');

const historyMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

const sendMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message is required.').max(2000),
  history: z.array(historyMessageSchema).max(50).optional().default([]),
});

const chatbotDoctorsQuerySchema = z.object({
  specialization: emptyToUndefined(z.string().trim().optional()),
});

const chatbotSlotsQuerySchema = z.object({
  doctorId: idParam,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.'),
});

const chatbotBookSchema = z.object({
  doctorId: idParam,
  slotId: idParam,
  reason: emptyToUndefined(z.string().trim().max(500).optional()),
});

const patientAppointmentsQuerySchema = z.object({
  filter: emptyToUndefined(z.enum(['upcoming', 'past', 'all']).optional()),
});

module.exports = {
  sendMessageSchema,
  chatbotDoctorsQuerySchema,
  chatbotSlotsQuerySchema,
  chatbotBookSchema,
  patientAppointmentsQuerySchema,
};
