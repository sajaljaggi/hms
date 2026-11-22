const { z } = require('zod');

// Form/multipart fields arrive as strings, and optional fields are often
// sent as ''. Treat '' (and null) as "not provided" before the inner schema
// runs, so optional() behaves as callers expect.
const emptyToUndefined = (schema) =>
  z.preprocess((val) => (val === '' || val === null ? undefined : val), schema);

// Some numeric-looking fields are actually a range <select> (e.g. weight:
// "15-20 kg"), which never parses as a clean number. Treat anything that
// doesn't parse as "not provided" rather than a validation error — matches
// this field's behavior before this validation layer existed, when it was
// silently dropped rather than blocking the whole request.
const looseNumber = (schema) =>
  z.preprocess((val) => {
    if (val === '' || val === null || val === undefined) return undefined;
    return Number.isNaN(Number(val)) ? undefined : val;
  }, schema);

// Route params / query strings are always strings — coerce to a positive int.
const idParam = z.coerce.number().int().positive();

// Strict YYYY-MM-DD that round-trips, so impossible dates like 2026-02-31 are rejected.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Invalid date');

module.exports = { emptyToUndefined, looseNumber, idParam, isoDate };
