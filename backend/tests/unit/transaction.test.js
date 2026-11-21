jest.mock('../../config/db', () => ({ getConnection: jest.fn() }));
const db = require('../../config/db');
const { inTransaction } = require('../../utils/transaction');

const mkConn = () => ({ beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() });
const dead = () => Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK', errno: 1213 });

beforeEach(() => db.getConnection.mockReset());

test('retries on deadlock with a fresh connection, then succeeds', async () => {
  const conns = [mkConn(), mkConn()];
  db.getConnection.mockResolvedValueOnce(conns[0]).mockResolvedValueOnce(conns[1]);
  const fn = jest.fn().mockRejectedValueOnce(dead()).mockResolvedValueOnce('ok');
  await expect(inTransaction(fn)).resolves.toBe('ok');
  expect(fn).toHaveBeenCalledTimes(2);
  expect(conns[0].rollback).toHaveBeenCalled();
  expect(conns[1].commit).toHaveBeenCalled();
  conns.forEach((c) => expect(c.release).toHaveBeenCalledTimes(1));
});

test('gives up after 2 retries (3 attempts) and rethrows', async () => {
  db.getConnection.mockImplementation(async () => mkConn());
  const fn = jest.fn().mockRejectedValue(dead());
  await expect(inTransaction(fn)).rejects.toMatchObject({ code: 'ER_LOCK_DEADLOCK' });
  expect(fn).toHaveBeenCalledTimes(3);
});

test('lock wait timeout is retried too', async () => {
  db.getConnection.mockImplementation(async () => mkConn());
  const fn = jest.fn().mockRejectedValueOnce(Object.assign(new Error('t'), { code: 'ER_LOCK_WAIT_TIMEOUT' })).mockResolvedValueOnce(1);
  await expect(inTransaction(fn)).resolves.toBe(1);
});

test('other errors are not retried; rollback failure does not mask the original', async () => {
  const c = mkConn();
  c.rollback.mockRejectedValue(new Error('rb'));
  db.getConnection.mockResolvedValue(c);
  const fn = jest.fn().mockRejectedValue(new Error('boom'));
  await expect(inTransaction(fn)).rejects.toThrow('boom');
  expect(fn).toHaveBeenCalledTimes(1);
  expect(c.release).toHaveBeenCalledTimes(1);
});
