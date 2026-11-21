jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db = require('../../config/db');
const { notifyUsers, notifyRoles } = require('../../services/notificationService');

const payload = { type: 'system', title: 'T', message: 'M', link: '/x' };

describe('notificationService', () => {
  let errSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  test('notifyUsers dedupes ids, drops falsy ones and does one multi-row insert', async () => {
    db.query.mockResolvedValue([{ affectedRows: 2 }]);
    const n = await notifyUsers([1, 2, 1, null, 0, undefined], payload);
    expect(n).toBe(2);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1][0]).toEqual([
      [1, 'system', 'T', 'M', '/x'],
      [2, 'system', 'T', 'M', '/x'],
    ]);
  });

  test('notifyUsers with an empty list returns 0 without touching the DB', async () => {
    expect(await notifyUsers([], payload)).toBe(0);
    expect(await notifyUsers([null], payload)).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('notifyUsers returns 0 and logs when the DB throws', async () => {
    db.query.mockRejectedValue(new Error('boom'));
    expect(await notifyUsers([1], payload)).toBe(0);
    expect(errSpy).toHaveBeenCalled();
  });

  test('notifyRoles does one INSERT ... SELECT and returns the count', async () => {
    db.query.mockResolvedValue([{ affectedRows: 3 }]);
    expect(await notifyRoles(['admin', 'doctor'], { type: 'system', title: 'T', message: 'M' })).toBe(3);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toMatch(/INSERT INTO notifications[\s\S]*SELECT[\s\S]*role IN/);
    expect(db.query.mock.calls[0][1]).toEqual(['system', 'T', 'M', null, ['admin', 'doctor']]);
  });

  test('notifyRoles returns 0 for no roles and on DB error', async () => {
    expect(await notifyRoles([], payload)).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
    db.query.mockRejectedValue(new Error('boom'));
    expect(await notifyRoles(['admin'], payload)).toBe(0);
    expect(errSpy).toHaveBeenCalled();
  });
});
