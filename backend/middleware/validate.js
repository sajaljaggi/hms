/**
 * Middleware factory: validate req[source] (body/query/params) against a
 * Zod schema before the request reaches the controller. On success,
 * req[source] is replaced with the parsed (and coerced/defaulted) data.
 * On failure, the ZodError is forwarded to errorHandler.js.
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return next(result.error);
  }
  req[source] = result.data;
  next();
};

module.exports = validate;
