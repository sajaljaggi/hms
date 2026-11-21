jest.mock('../../config/db', () => ({ getConnection: jest.fn(), query: jest.fn() }));
jest.mock('../../services/notificationService', () => ({
  notifyUsers: jest.fn().mockResolvedValue(1),
  notifyRoles: jest.fn().mockResolvedValue(1),
}));
jest.mock('../../services/bedService', () => ({ allocateBed: jest.fn() }));

const db = require('../../config/db');
const { notifyUsers } = require('../../services/notificationService');
const { allocateBed } = require('../../services/bedService');
const { updateCase, admit } = require('../../controllers/emergencyController');

const conn = () => ({ query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() });
const run = async (fn, body, c) => {
  db.getConnection.mockResolvedValue(c);
  const req = { params: { id: 5 }, body, user: { id: 1 } };
  const res = { json: jest.fn() };
  const next = jest.fn();
  await fn(req, res, next);
  return { res, next };
};

beforeEach(() => jest.clearAllMocks());

describe('updateCase', () => {
  test('invalid transition -> 409, rolled back, no notification', async () => {
    const c = conn();
    c.query.mockResolvedValueOnce([[{ status: 'discharged' }]]);
    const { next } = await run(updateCase, { status: 'in_treatment' }, c);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(c.rollback).toHaveBeenCalled();
    expect(c.release).toHaveBeenCalled();
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  test('discharge sets closed_at; doctor assignment notifies after commit', async () => {
    const c = conn();
    c.query.mockResolvedValueOnce([[{ status: 'in_treatment' }]]).mockResolvedValueOnce([[{ user_id: 77 }]]).mockResolvedValueOnce([{}]);
    const { res } = await run(updateCase, { status: 'discharged', assignedDoctorId: 3 }, c);
    expect(c.query.mock.calls[2][0]).toContain('closed_at = NOW()');
    expect(c.commit).toHaveBeenCalled();
    expect(notifyUsers).toHaveBeenCalledWith([77], expect.objectContaining({ type: 'emergency' }));
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('unknown doctor -> 404', async () => {
    const c = conn();
    c.query.mockResolvedValueOnce([[{ status: 'waiting' }]]).mockResolvedValueOnce([[]]);
    const { next } = await run(updateCase, { assignedDoctorId: 99 }, c);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });
});

describe('admit', () => {
  test('already closed -> 409', async () => {
    const c = conn();
    c.query.mockResolvedValueOnce([[{ status: 'discharged', patient_id: 2, chief_complaint: 'x' }]]);
    const { next } = await run(admit, { bedId: 1 }, c);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(allocateBed).not.toHaveBeenCalled();
  });

  test('no patient_id -> 400', async () => {
    const c = conn();
    c.query.mockResolvedValueOnce([[{ status: 'waiting', patient_id: null, chief_complaint: 'x' }]]);
    const { next } = await run(admit, { bedId: 1 }, c);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  test('success allocates with truncated reason', async () => {
    const c = conn();
    c.query.mockResolvedValueOnce([[{ status: 'waiting', patient_id: 2, chief_complaint: 'y'.repeat(300) }]]).mockResolvedValueOnce([{}]);
    allocateBed.mockResolvedValue({ allocationId: 9 });
    const { res } = await run(admit, { bedId: 1 }, c);
    expect(allocateBed.mock.calls[0][1].reason).toBe(`Emergency: ${'y'.repeat(200)}`);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { allocationId: 9 } });
  });
});
