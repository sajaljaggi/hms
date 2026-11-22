jest.mock('../../config/db', () => ({ getConnection: jest.fn(), query: jest.fn() }));
jest.mock('../../services/notificationService', () => ({ notifyUsers: jest.fn().mockResolvedValue(1) }));
jest.mock('../../services/paymentGateway', () => ({
  getMode: jest.fn(() => 'mock'),
  createOrder: jest.fn(async () => ({ id: 'order_mock_abc' })),
  signCheckout: jest.fn(() => 'sig'),
  verifyCheckoutSignature: jest.fn(() => false),
}));

const db = require('../../config/db');
const gateway = require('../../services/paymentGateway');
const { createOrder, verifyPayment } = require('../../controllers/paymentController');

const conn = () => ({ query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() });
const run = async (fn, body, c) => {
  db.getConnection.mockResolvedValue(c);
  const res = { json: jest.fn() };
  const next = jest.fn();
  await fn({ body, user: { id: 9 } }, res, next);
  return { res, next };
};

beforeEach(() => jest.clearAllMocks());

describe('createOrder', () => {
  test('amount comes from the doctor fee in the DB, never the client body', async () => {
    const appt = [[{ status: 'pending', payment_status: 'unpaid', doctor_id: 3, slot_id: 4 }]];
    const upcoming = [[{ past: 0 }]];
    const fee = [[{ amount_paise: '75050' }]];
    db.query.mockResolvedValueOnce(appt).mockResolvedValueOnce(upcoming).mockResolvedValueOnce(fee).mockResolvedValueOnce([[]]);
    const c = conn();
    c.query.mockResolvedValueOnce(appt).mockResolvedValueOnce(upcoming).mockResolvedValueOnce(fee).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);
    const { res, next } = await run(createOrder, { appointmentId: 5, amount: 1, amountPaise: 1 }, c);
    expect(next).not.toHaveBeenCalled();
    expect(gateway.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 75050 }));
    expect(c.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(c.query.mock.calls[1][0]).not.toContain('FOR UPDATE'); // slot read stays outside the lock order
    expect(c.query.mock.calls[4][1]).toEqual([5, 9, 75050, 'mock', 'order_mock_abc']);
    expect(res.json.mock.calls[0][0].data).toMatchObject({ orderId: 'order_mock_abc', amount: 75050, currency: 'INR', mode: 'mock', mock: { signature: 'sig' } });
  });

  test('cancelled -> 400, completed -> 400 and already paid -> 409, without calling the gateway', async () => {
    db.query.mockResolvedValueOnce([[{ status: 'cancelled', payment_status: 'unpaid', doctor_id: 3 }]]);
    expect((await run(createOrder, { appointmentId: 5 }, conn())).next.mock.calls[0][0].statusCode).toBe(400);
    db.query.mockResolvedValueOnce([[{ status: 'completed', payment_status: 'unpaid', doctor_id: 3 }]]);
    const completed = (await run(createOrder, { appointmentId: 5 }, conn())).next.mock.calls[0][0];
    expect(completed.statusCode).toBe(400);
    expect(completed.message).toBe('Only upcoming appointments can be paid.');
    db.query.mockResolvedValueOnce([[{ status: 'pending', payment_status: 'paid', doctor_id: 3 }]]);
    expect((await run(createOrder, { appointmentId: 5 }, conn())).next.mock.calls[0][0].statusCode).toBe(409);
    expect(gateway.createOrder).not.toHaveBeenCalled();
  });

  test('pending but past its time (plus the join grace) -> 400 without calling the gateway', async () => {
    db.query
      .mockResolvedValueOnce([[{ status: 'pending', payment_status: 'unpaid', doctor_id: 3, slot_id: 4 }]])
      .mockResolvedValueOnce([[{ past: 1 }]]);
    const err = (await run(createOrder, { appointmentId: 5 }, conn())).next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('This appointment time has passed.');
    expect(db.query.mock.calls[1][1]).toEqual([60, 4]);
    expect(gateway.createOrder).not.toHaveBeenCalled();
  });
});

describe('verifyPayment', () => {
  test('bad signature -> 400, rolled back, nothing updated', async () => {
    const c = conn();
    c.query.mockResolvedValueOnce([[{ provider: 'mock' }]]);
    const { next } = await run(verifyPayment, { orderId: 'o', paymentId: 'p', signature: 'bad' }, c);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(c.query).toHaveBeenCalledTimes(1);
    expect(c.rollback).toHaveBeenCalled();
  });

  test('payment row from another provider mode -> 400 before the signature is checked', async () => {
    const c = conn();
    c.query.mockResolvedValueOnce([[{ provider: 'razorpay' }]]);
    const { next } = await run(verifyPayment, { orderId: 'o', paymentId: 'p', signature: 'abc' }, c);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(gateway.verifyCheckoutSignature).not.toHaveBeenCalled();
  });
});
