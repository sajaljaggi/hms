const { z } = require('zod');

// Form/multipart fields arrive as strings, and optional fields are often
// sent as ''. Treat '' (and null) as "not provided" before the inner schema
// runs, so optional() behaves as callers expect.
const emptyToUndefined = (schema) =>
  z.preprocess((val) => (val === '' || val === null ? undefined : val), schema);

// Route params / query strings are always strings — coerce to a positive int.
const idParam = z.coerce.number().int().positive();

module.exports = { emptyToUndefined, idParam };
