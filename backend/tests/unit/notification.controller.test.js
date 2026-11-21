jest.mock('../../config/db', () => ({ query: jest.fn() }));

const db = require('../../config/db');
const { listNotifications, markRead, markAllRead } = require('../../controllers/notificationController');
const { NotFoundError } = require('../../utils/errors');

const mk = (extra = {}) => ({
  req: { user: { id: 5 }, query: {}, params: {}, ...extra },
  res: { json: jest.fn() },
  next: jest.fn(),
});

describe('notificationController', () => {
  beforeEach(() => jest.clearAllMocks());

  test('listNotifications returns rows and unreadCount scoped to the user', async () => {
    db.query.mockResolvedValueOnce([[{ id: 1 }]]).mockResolvedValueOnce([[{ unreadCount: 4 }]]);
    const { req, res, next } = mk({ query: { unreadOnly: true, limit: 7 } });
    await listNotifications(req, res, next);
    expect(db.query.mock.calls[0][0]).toContain('is_read = 0');
    expect(db.query.mock.calls[0][1]).toEqual([5, 7]);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 1 }], unreadCount: 4 });
  });

  test('markRead -> NotFoundError when no row matches the user', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const { req, res, next } = mk({ params: { id: 9 } });
    await markRead(req, res, next);
    expect(db.query.mock.calls[0][1]).toEqual([9, 5]);
    expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
    expect(res.json).not.toHaveBeenCalled();
  });

  test('markRead succeeds when the row is the user\'s', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const { req, res, next } = mk({ params: { id: 9 } });
    await markRead(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('markAllRead reports the updated count', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 3 }]);
    const { req, res, next } = mk();
    await markAllRead(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ success: true, updated: 3 });
  });

  test('DB errors are forwarded to next', async () => {
    const err = new Error('db');
    db.query.mockRejectedValue(err);
    const { req, res, next } = mk();
    await markAllRead(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});
