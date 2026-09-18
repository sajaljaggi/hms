jest.mock('../../config/db', () => ({
  getConnection: jest.fn(),
  query: jest.fn(),
}));

// The controller also touches the availability cache — keep this a pure
// unit test of the booking logic by stubbing it out rather than letting it
// try to reach a real Redis instance.
jest.mock('../../utils/cache', () => ({
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  invalidateCache: jest.fn().mockResolvedValue(undefined),
  availabilityKey: (doctorId, date) => `availability:${doctorId}:${date}`,
}));

const db = require('../../config/db');
const { bookAppointment } = require('../../controllers/appointmentController');
const { NotFoundError, ConflictError, ValidationError } = require('../../utils/errors');

// Builds a fresh mock connection per test — mirrors what mysql2's
// pool.getConnection() returns, but with jest.fn() query results we control.
function mockConnection() {
  return {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };
}

function mockReqRes({ doctorId = 1, slotId = 1, reason = undefined } = {}) {
  const req = { body: { doctorId, slotId, reason }, user: { id: 42 } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
};
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
};

describe('bookAppointment (conflict-resolution logic)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successful booking: slot is free, available, and in the future', async () => {
    const conn = mockConnection();
    conn.query
      .mockResolvedValueOnce([[{ id: 1, date: tomorrow(), time: '09:00:00', is_booked: 0, is_available: 1 }]]) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE is_booked
      .mockResolvedValueOnce([{ insertId: 555 }]); // INSERT appointment
    db.getConnection.mockResolvedValue(conn);

    const { req, res, next } = mockReqRes({ slotId: 1 });
    await bookAppointment(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, appointmentId: 555 }));
  });

  test('double-booking: slot already booked -> 409 ConflictError, transaction rolled back', async () => {
    const conn = mockConnection();
    conn.query.mockResolvedValueOnce([[{ id: 2, date: tomorrow(), time: '09:15:00', is_booked: 1, is_available: 1 }]]);
    db.getConnection.mockResolvedValue(conn);

    const { req, res, next } = mockReqRes({ slotId: 2 });
    await bookAppointment(req, res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.statusCode).toBe(409);
  });

  test('slot not found -> 404 NotFoundError', async () => {
    const conn = mockConnection();
    conn.query.mockResolvedValueOnce([[]]); // no rows
    db.getConnection.mockResolvedValue(conn);

    const { req, res, next } = mockReqRes({ slotId: 999 });
    await bookAppointment(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.statusCode).toBe(404);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
  });

  test('slot blocked by admin (is_available=0) -> 400 ValidationError', async () => {
    const conn = mockConnection();
    conn.query.mockResolvedValueOnce([[{ id: 3, date: tomorrow(), time: '09:00:00', is_booked: 0, is_available: 0 }]]);
    db.getConnection.mockResolvedValue(conn);

    const { req, res, next } = mockReqRes({ slotId: 3 });
    await bookAppointment(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
  });

  test('slot already in the past -> 400 ValidationError', async () => {
    const conn = mockConnection();
    conn.query.mockResolvedValueOnce([[{ id: 4, date: yesterday(), time: '09:00:00', is_booked: 0, is_available: 1 }]]);
    db.getConnection.mockResolvedValue(conn);

    const { req, res, next } = mockReqRes({ slotId: 4 });
    await bookAppointment(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
  });

  test('back-to-back slots: two adjacent, independent time slots both book successfully', async () => {
    // Slot A: 09:00, Slot B: 09:15 (immediately after A) — booking one must
    // not be affected by the other; the conflict check is per-slot-row, not
    // time-adjacency, so both should succeed independently.
    const connA = mockConnection();
    connA.query
      .mockResolvedValueOnce([[{ id: 10, date: tomorrow(), time: '09:00:00', is_booked: 0, is_available: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ insertId: 101 }]);

    const connB = mockConnection();
    connB.query
      .mockResolvedValueOnce([[{ id: 11, date: tomorrow(), time: '09:15:00', is_booked: 0, is_available: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ insertId: 102 }]);

    db.getConnection.mockResolvedValueOnce(connA).mockResolvedValueOnce(connB);

    const first = mockReqRes({ slotId: 10 });
    await bookAppointment(first.req, first.res, first.next);
    const second = mockReqRes({ slotId: 11 });
    await bookAppointment(second.req, second.res, second.next);

    expect(first.next).not.toHaveBeenCalled();
    expect(second.next).not.toHaveBeenCalled();
    expect(first.res.status).toHaveBeenCalledWith(201);
    expect(second.res.status).toHaveBeenCalledWith(201);
    expect(connA.commit).toHaveBeenCalledTimes(1);
    expect(connB.commit).toHaveBeenCalledTimes(1);
  });
});
