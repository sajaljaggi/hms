const { z } = require('zod');
const { emptyToUndefined, idParam } = require('./common');

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.');

const getDoctorsQuerySchema = z.object({
  specialization: emptyToUndefined(z.string().trim().optional()),
});

const getSlotsQuerySchema = z.object({
  doctorId: idParam,
  date: dateStr,
});

const bookAppointmentSchema = z.object({
  doctorId: idParam,
  slotId:   idParam,
  reason:   emptyToUndefined(z.string().trim().max(500).optional()),
});

module.exports = { getDoctorsQuerySchema, getSlotsQuerySchema, bookAppointmentSchema };
