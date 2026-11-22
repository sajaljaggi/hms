const { z } = require('zod');
const { idParam } = require('./common');

// This is a full-form PUT: the frontend always sends every field, using ''
// to mean "cleared". Text fields keep '' as a real value (so COALESCE writes
// a blank instead of preserving the old value) — only trim, don't drop it.
// Each limit matches its users column, so a long value is a clear 400, not a database error.
const textField = (max) => z.string().trim().max(max, `Must be at most ${max} characters.`).optional();

// Numeric fields: '' means "no value" -> NULL (COALESCE keeps prior value),
// since an empty string isn't a valid DECIMAL/INT bind param. weight is
// actually a range <select> ("15-20 kg"), which never parses as a clean
// number either — treat that the same as "no value" rather than rejecting
// the whole profile update.
const numericOrEmpty = (schema) =>
  z.preprocess((val) => {
    if (val === '' || val === null) return null;
    return Number.isNaN(Number(val)) ? null : val;
  }, schema.nullable().optional());

const updateProfileSchema = z.object({
  // A name can be changed but never blanked.
  name:            z.string().trim().min(1, 'Name cannot be empty.').max(100, 'Must be at most 100 characters.').optional(),
  phone:           textField(20),
  // '' is the form's "not chosen"; it keeps the stored value (gender is an ENUM, '' is not a valid value).
  gender:          z.union([z.enum(['male', 'female', 'other']), z.literal('').transform(() => undefined)]).optional(),
  age:             numericOrEmpty(z.coerce.number().int().min(0).max(150)),
  weight:          numericOrEmpty(z.coerce.number().positive()),
  address:         textField(1000),
  city:            textField(100),
  medical_history: textField(5000),
  guardian_name:   textField(150),
});

const submitRatingSchema = z.object({
  appointmentId: idParam,
  stars: z.coerce.number().int().min(1, 'stars must be between 1 and 5.').max(5, 'stars must be between 1 and 5.'),
});

module.exports = { updateProfileSchema, submitRatingSchema };
