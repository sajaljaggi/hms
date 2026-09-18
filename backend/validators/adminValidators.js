const { z } = require('zod');
const { emptyToUndefined, idParam } = require('./common');

const SPECIALIZATIONS = ['Cardiology', 'Dermatology', 'Neurology', 'Orthopedics', 'General Medicine'];
const APPOINTMENT_STATUSES = ['pending', 'completed', 'cancelled'];

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format.');

const idParamsSchema = z.object({ id: idParam });
const slotIdParamsSchema = z.object({ slotId: idParam });

// multipart/form-data — every field arrives as a string.
const createDoctorSchema = z.object({
  name:           z.string().trim().min(1, 'Name is required.'),
  email:          z.string().trim().toLowerCase().email('Invalid email address.'),
  password:       z.string().min(6, 'Password must be at least 6 characters.'),
  specialization: z.enum(SPECIALIZATIONS, { message: `specialization must be one of: ${SPECIALIZATIONS.join(', ')}.` }),
  fees:           z.coerce.number().positive('fees must be a positive number.'),
  phone:          emptyToUndefined(z.string().trim().optional()),
});

const updateDoctorSchema = z.object({
  name:           z.string().trim().min(1, 'Name is required.'),
  phone:          emptyToUndefined(z.string().trim().optional()),
  specialization: z.enum(SPECIALIZATIONS, { message: `specialization must be one of: ${SPECIALIZATIONS.join(', ')}.` }),
  fees:           z.coerce.number().positive('fees must be a positive number.'),
});

const updateUserSchema = z.object({
  name:    emptyToUndefined(z.string().trim().optional()),
  phone:   emptyToUndefined(z.string().trim().optional()),
  city:    emptyToUndefined(z.string().trim().optional()),
  address: emptyToUndefined(z.string().trim().optional()),
});

const updateAppointmentSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES, { message: `status must be one of: ${APPOINTMENT_STATUSES.join(', ')}.` }),
});

const adminSlotsQuerySchema = z.object({
  doctorId: idParam,
  date: dateStr,
});

const blockDaySchema = z.object({
  doctorId: idParam,
  date: dateStr,
});

const generateSlotsSchema = z.object({
  doctorId: emptyToUndefined(idParam.optional()),
  date: dateStr,
});

module.exports = {
  SPECIALIZATIONS,
  APPOINTMENT_STATUSES,
  idParamsSchema,
  slotIdParamsSchema,
  createDoctorSchema,
  updateDoctorSchema,
  updateUserSchema,
  updateAppointmentSchema,
  adminSlotsQuerySchema,
  blockDaySchema,
  generateSlotsSchema,
};
