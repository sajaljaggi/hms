const { z } = require('zod');
const errorHandler = require('../../middleware/errorHandler');
const { NotFoundError, ValidationError } = require('../../utils/errors');

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const mockReq = () => ({ method: 'GET', originalUrl: '/api/test' });

describe('errorHandler', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  test('AppError subclass: uses its statusCode/code/message', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    errorHandler(new NotFoundError('Doctor not found.'), mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Doctor not found.',
        error: expect.objectContaining({ code: 'NOT_FOUND', message: 'Doctor not found.' }),
      })
    );
  });

  test('ZodError (from a failed schema parse): 400 with field-level details', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: 'not-an-email' });

    const res = mockRes();
    errorHandler(result.error, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'email' })])
    );
  });

  test('known MySQL duplicate-entry error: mapped to 409 CONFLICT, not a raw 500', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const mysqlErr = Object.assign(new Error("Duplicate entry 'a@b.com' for key 'email'"), { code: 'ER_DUP_ENTRY' });

    const res = mockRes();
    errorHandler(mysqlErr, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe('CONFLICT');
  });

  test('unknown error in production: hides the internal message from the client', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NODE_ENV = 'production';
    const res = mockRes();
    errorHandler(new Error('SELECT * FROM users failed: ECONNREFUSED'), mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Something went wrong. Please try again later.');
    expect(body.message).not.toMatch(/ECONNREFUSED/);
    expect(body.stack).toBeUndefined();
  });

  test('unknown error in development: surfaces the real message to help debugging', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NODE_ENV = 'development';
    const res = mockRes();
    errorHandler(new ValidationError('Cannot delete your own account.'), mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe('Cannot delete your own account.');
  });
});
