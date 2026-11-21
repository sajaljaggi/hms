const db = require('../config/db');

// Runs fn(conn) in a transaction: rollback on error, release always.
async function inTransaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* keep the original error */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { inTransaction };
