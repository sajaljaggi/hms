jest.mock('../../config/db', () => ({ getConnection: jest.fn(), query: jest.fn() }));
jest.mock('../../services/notificationService', () => ({ notifyUsers: jest.fn().mockResolvedValue(1) }));

const db = require('../../config/db');
const { isWithinJoinWindow } = require('../../utils/dates');
const { join } = require('../../controllers/teleconsultController');

describe('isWithinJoinWindow', () => {
  const at = (min) => new Date(2030, 0, 15, 10, min, 0); // local time, slot starts 10:00
  test.each([[-16, false], [-15, true], [0, true], [60, true], [61, false]])('%i min from start -> %s', (min, expected) => {
    expect(isWithinJoinWindow('2030-01-15', '10:00:00', at(min))).toBe(expected);
  });
});

describe('join access', () => {
  const run = async (user, row) => {
    db.query.mockResolvedValueOnce([row ? [row] : []]);
    const next = jest.fn();
    await join({ params: { appointmentId: 1 }, user }, { json: jest.fn() }, next);
    return next.mock.calls[0][0];
  };
  const base = { id: 1, patient_id: 5, doctor_user_id: 9, status: 'pending', payment_status: 'paid', consultation_type: 'video', video_room: 'hms-x', date: '2030-01-15', time: '10:00:00' };

  test('stranger and missing appointment -> 404', async () => {
    expect((await run({ id: 77 }, base)).statusCode).toBe(404);
    expect((await run({ id: 5 }, null)).statusCode).toBe(404);
  });
  test('in-person -> 400, completed -> 409', async () => {
    expect((await run({ id: 5 }, { ...base, consultation_type: 'in_person', video_room: null })).statusCode).toBe(400);
    expect((await run({ id: 5 }, { ...base, status: 'completed' })).statusCode).toBe(409);
  });
  test('unpaid patient -> 402, unpaid doctor passes payment gate (fails on window)', async () => {
    expect((await run({ id: 5 }, { ...base, payment_status: 'unpaid' })).code).toBe('PAYMENT_REQUIRED');
    const err = await run({ id: 9 }, { ...base, payment_status: 'unpaid' });
    expect(err.code).toBe('OUTSIDE_JOIN_WINDOW');
    expect(err.details.startsAt).toBeDefined();
  });
});
