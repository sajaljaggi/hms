const jwt = require('jsonwebtoken');
const auth = require('../../middleware/auth');
const { AuthError } = require('../../utils/errors');

const signAccess = (payload, options = {}) =>
  jwt.sign({ id: 1, email: 'a@b.com', role: 'patient', type: 'access', ...payload }, process.env.JWT_SECRET, {
    expiresIn: '15m',
    ...options,
  });

const mockReq = (accessToken) => ({ cookies: accessToken ? { access_token: accessToken } : {} });
const mockRes = () => ({});

describe('auth middleware', () => {
  test('valid access token: attaches req.user and calls next() with no error', () => {
    const token = signAccess();
    const req = mockReq(token);
    const next = jest.fn();

    auth(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no args = success
    expect(req.user).toMatchObject({ id: 1, email: 'a@b.com', role: 'patient', type: 'access' });
  });

  test('missing token: rejects with a 401 AuthError', () => {
    const req = mockReq(undefined);
    const next = jest.fn();

    auth(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthError);
    expect(err.statusCode).toBe(401);
  });

  test('expired token: rejects with a 401 AuthError', () => {
    const token = signAccess({}, { expiresIn: '-1s' });
    const req = mockReq(token);
    const next = jest.fn();

    auth(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthError);
    expect(err.statusCode).toBe(401);
  });

  test('tampered token: rejects with a 401 AuthError', () => {
    const token = signAccess();
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    const req = mockReq(tampered);
    const next = jest.fn();

    auth(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthError);
    expect(err.statusCode).toBe(401);
  });

  test('token signed with the wrong secret: rejects with a 401 AuthError', () => {
    const token = jwt.sign({ id: 1, type: 'access' }, 'not-the-real-secret', { expiresIn: '15m' });
    const req = mockReq(token);
    const next = jest.fn();

    auth(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthError);
    expect(err.statusCode).toBe(401);
  });

  test('refresh token used as an access token: rejected by the type check', () => {
    const refreshToken = jwt.sign({ id: 1, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const req = mockReq(refreshToken);
    const next = jest.fn();

    auth(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toMatch(/invalid token type/i);
  });
});
