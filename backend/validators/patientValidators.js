const { z } = require('zod');
const { idParam } = require('./common');

// This is a full-form PUT: the frontend always sends every field, using ''
// to mean "cleared". Text fields keep '' as a real value (so COALESCE writes
// a blank instead of preserving the old value) — only trim, don't drop it.
const textField = z.string().trim().optional();

// Numeric fields: '' means "no value" -> NULL (COALESCE keeps prior value),
// since an empty string isn't a valid DECIMAL/INT bind param.
const numericOrEmpty = (schema) =>
  z.preprocess((val) => (val === '' ? null : val), schema.nullable().optional());

const updateProfileSchema = z.object({
  name:            textField,
  phone:           textField,
  gender:          z.union([z.enum(['male', 'female', 'other']), z.literal('')]).optional(),
  age:             numericOrEmpty(z.coerce.number().int().min(0).max(150)),
  weight:          numericOrEmpty(z.coerce.number().positive()),
  address:         textField,
  city:            textField,
  medical_history: textField,
  guardian_name:   textField,
});

const submitRatingSchema = z.object({
  appointmentId: idParam,
  stars: z.coerce.number().int().min(1, 'stars must be between 1 and 5.').max(5, 'stars must be between 1 and 5.'),
});

module.exports = { updateProfileSchema, submitRatingSchema };
