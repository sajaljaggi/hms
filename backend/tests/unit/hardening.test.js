jest.mock('../../config/db', () => ({ getConnection: jest.fn(), query: jest.fn() }));
jest.mock('../../utils/cache', () => ({
  invalidateCache: jest.fn(), invalidateByPattern: jest.fn(), availabilityKey: jest.fn(), availabilityKeyPattern: jest.fn(),
}));

const db = require('../../config/db');
const { createDoctor } = require('../../controllers/adminController');
const { detectMime } = require('../../middleware/upload');

describe('createDoctor', () => {
  test('a failure after the user insert rolls back, so no doctor login is left without a profile', async () => {
    const conn = { query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
    conn.query
      .mockResolvedValueOnce([[]]) // no existing email
      .mockResolvedValueOnce([{ insertId: 7 }]) // INSERT users
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'ER_SOMETHING' })); // INSERT doctors
    db.getConnection.mockResolvedValue(conn);
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await createDoctor({ body: { name: 'Dr X', email: 'x@example.com', password: 'secret1', specialization: 'Cardiology', fees: 500 } }, res, next);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0].message).toBe('boom');
    expect(db.query).not.toHaveBeenCalled(); // slot generation never ran
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('detectMime', () => {
  const pad = (b) => Buffer.concat([b, Buffer.alloc(16)]);
  test.each([
    ['pdf', pad(Buffer.from('%PDF-1.7')), 'application/pdf'],
    ['png', pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png'],
    ['jpeg', pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg'],
    ['webp', pad(Buffer.from('RIFF\0\0\0\0WEBP')), 'image/webp'],
    ['html named .pdf', pad(Buffer.from('<html><script>')), null],
    ['svg', pad(Buffer.from('<svg xmlns=')), null],
    ['too short', Buffer.from('%PDF'), null],
  ])('%s', (_label, buf, expected) => {
    expect(detectMime(buf)).toBe(expected);
  });
});
