const db = require('../config/db');
const { NotFoundError } = require('../utils/errors');

// GET /api/notifications?unreadOnly=&limit=
const listNotifications = async (req, res, next) => {
  try {
    // Express 5 makes req.query read-only, so validated coercions never land on it: parse here.
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = Number(req.query.limit) || 20;
    const [rows] = await db.query(
      `SELECT id, type, title, message, link, is_read, created_at
       FROM notifications
       WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [req.user.id, limit]
    );
    const [[{ unreadCount }]] = await db.query(
      'SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ success: true, data: rows, unreadCount });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/notifications/:id/read
const markRead = async (req, res, next) => {
  try {
    // Ownership is part of the WHERE; a no-op re-read still matches the row.
    const [result] = await db.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) throw new NotFoundError('Notification not found.');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/notifications/read-all
const markAllRead = async (req, res, next) => {
  try {
    const [result] = await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ success: true, updated: result.affectedRows });
  } catch (err) {
    next(err);
  }
};

module.exports = { listNotifications, markRead, markAllRead };
