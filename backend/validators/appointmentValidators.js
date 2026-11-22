const { z } = require('zod');
const { emptyToUndefined, idParam } = require('./common');
const { bookingWindow, BOOKING_DAYS } = require('../utils/dates');

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.');

const getDoctorsQuerySchema = z.object({
  specialization: emptyToUndefined(z.string().trim().optional()),
});

// Public: asking for a date also creates that day's slots, so only bookable dates are accepted.
const getSlotsQuerySchema = z.object({
  doctorId: idParam,
  date: dateStr.refine((d) => { const w = bookingWindow(); return d >= w.first && d <= w.last; },
    `date must be today or within the next ${BOOKING_DAYS - 1} days.`),
});

const bookAppointmentSchema = z.object({
  doctorId: idParam,
  slotId:   idParam,
  reason:   emptyToUndefined(z.string().trim().max(500).optional()),
  consultationType: z.enum(['in_person', 'video']).default('in_person'),
});

module.exports = { getDoctorsQuerySchema, getSlotsQuerySchema, bookAppointmentSchema };
