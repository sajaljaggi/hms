const { z } = require('zod');
const { emptyToUndefined } = require('./common');

const registerSchema = z.object({
  name:     z.string().trim().min(1, 'Name is required.'),
  email:    z.string().trim().toLowerCase().email('Invalid email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  phone:         emptyToUndefined(z.string().trim().optional()),
  gender:        emptyToUndefined(z.enum(['male', 'female', 'other']).optional()),
  age:           emptyToUndefined(z.coerce.number().int().min(0).max(150).optional()),
  weight:        emptyToUndefined(z.coerce.number().positive().optional()),
  address:       emptyToUndefined(z.string().trim().optional()),
  city:          emptyToUndefined(z.string().trim().optional()),
  guardian_name: emptyToUndefined(z.string().trim().optional()),
});

const loginSchema = z.object({
  email:    z.string().trim().toLowerCase().email('Invalid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

module.exports = { registerSchema, loginSchema };
