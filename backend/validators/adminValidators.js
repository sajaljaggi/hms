const { z } = require('zod');
const { emptyToUndefined, idParam } = require('./common');

const SPECIALIZATIONS = ['Cardiology', 'Dermatology', 'Neurology', 'Orthopedics', 'General Medicine'];
const APPOINTMENT_STATUSES = ['pending', 'completed', 'cancelled'];
// A visit only moves pending -> completed or pending -> cancelled.
const APPOINTMENT_CHANGES = ['completed', 'cancelled'];

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

// Absent = unchanged, '' = clear (except name, which cannot be blank).
const listUsersQuerySchema = z.object({
  role: emptyToUndefined(z.enum(['patient', 'doctor', 'admin']).optional()),
  q: emptyToUndefined(z.string().trim().max(100).optional()),
  sort: z.enum(['name-asc', 'name-desc', 'date-new', 'date-old']).default('date-new'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listAppointmentsQuerySchema = z.object({
  status: emptyToUndefined(z.enum(APPOINTMENT_STATUSES).optional()),
  q: emptyToUndefined(z.string().trim().max(100).optional()),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const updateUserSchema = z.object({
  name:    z.string().trim().min(1, 'Name cannot be empty.').max(100).optional(),
  phone:   z.string().trim().max(20).optional(),
  city:    z.string().trim().max(100).optional(),
  address: z.string().trim().max(255).optional(),
}).refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'Nothing to update.' });

const updateAppointmentSchema = z.object({
  status: z.enum(APPOINTMENT_CHANGES, { message: `status must be one of: ${APPOINTMENT_CHANGES.join(', ')}.` }),
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
  listUsersQuerySchema,
  listAppointmentsQuerySchema,
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
