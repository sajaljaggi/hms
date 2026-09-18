const { z } = require('zod');
const { emptyToUndefined, idParam } = require('./common');

const APPOINTMENT_STATUSES = ['pending', 'completed', 'cancelled'];

const getAppointmentsQuerySchema = z.object({
  date:    emptyToUndefined(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.').optional()),
  patient: emptyToUndefined(z.string().trim().optional()),
});

const updateAppointmentStatusSchema = z.object({
  appointmentId: idParam,
  status: z.enum(APPOINTMENT_STATUSES, { message: `status must be one of: ${APPOINTMENT_STATUSES.join(', ')}.` }),
});

const createPrescriptionSchema = z.object({
  appointmentId: idParam,
  patientId: idParam,
  notes: emptyToUndefined(z.string().trim().max(5000).optional()),
});

const slotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.'),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'time must be in HH:MM format.'),
});

const createSlotsSchema = z.object({
  slots: z.array(slotSchema).min(1, 'slots array is required.'),
});

module.exports = {
  getAppointmentsQuerySchema,
  updateAppointmentStatusSchema,
  createPrescriptionSchema,
  createSlotsSchema,
};
