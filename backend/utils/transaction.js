const db = require('../config/db');

// Only deadlocks retry: a lock-wait timeout already waited innodb_lock_wait_timeout, so it surfaces as 409.
const RETRYABLE = new Set(['ER_LOCK_DEADLOCK']);
const MAX_RETRIES = 2;

// Runs fn(conn) in a transaction: rollback on error, release always.
// Deadlocks retry the whole callback on a fresh connection, so fn must have
// no side effects outside the DB (notifications etc. belong after inTransaction returns).
async function inTransaction(fn) {
  for (let attempt = 0; ; attempt++) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      try { await conn.rollback(); } catch { /* keep the original error */ }
      if (!RETRYABLE.has(err.code) || attempt >= MAX_RETRIES) throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = { inTransaction };
