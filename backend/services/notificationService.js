const db = require('../config/db');

// Both helpers are fire-and-forget safe: a notification failure must never
// break the business action that triggered it, so errors are logged, not thrown.

async function notifyUsers(userIds, { type, title, message, link = null }) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (ids.length === 0) return 0;
    const [result] = await db.query(
      'INSERT INTO notifications (user_id, type, title, message, link) VALUES ?',
      [ids.map((id) => [id, type, title, message, link])]
    );
    return result.affectedRows;
  } catch (err) {
    console.error('notifyUsers failed:', err.message);
    return 0;
  }
}

async function notifyRoles(roles, { type, title, message, link = null }) {
  try {
    if (!roles || roles.length === 0) return 0;
    const [result] = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       SELECT id, ?, ?, ?, ? FROM users WHERE role IN (?)`,
      [type, title, message, link, roles]
    );
    return result.affectedRows;
  } catch (err) {
    console.error('notifyRoles failed:', err.message);
    return 0;
  }
}

module.exports = { notifyUsers, notifyRoles };
