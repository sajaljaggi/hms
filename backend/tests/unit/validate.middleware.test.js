const { z } = require('zod');
const validate = require('../../middleware/validate');

describe('validate middleware', () => {
  const schema = z.object({ n: z.coerce.number() });

  test('query: coerced data is visible even when req.query is a getter-only property (Express 5)', () => {
    const req = {};
    Object.defineProperty(req, 'query', { get: () => ({ n: '5' }), configurable: true });
    const next = jest.fn();
    validate(schema, 'query')(req, {}, next);
    expect(req.query).toEqual({ n: 5 });
    expect(next).toHaveBeenCalledWith();
  });

  test('body: assigned plainly', () => {
    const req = { body: { n: '7' } };
    validate(schema)(req, {}, jest.fn());
    expect(req.body).toEqual({ n: 7 });
  });

  test('invalid input forwards the ZodError', () => {
    const req = { body: { n: 'x' } };
    const next = jest.fn();
    validate(schema)(req, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(z.ZodError);
  });
});
