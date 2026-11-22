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

// Booking confirmation to the patient and the doctor. Shared by the booking form and the chatbot.
async function notifyBooking({ patientId, doctorId, dateStr, time, isVideo = false }) {
  try {
    const [[doc]] = await db.query('SELECT user_id FROM doctors WHERE id = ?', [doctorId]);
    const when = `${dateStr} ${String(time).slice(0, 5)}`;
    const kind = isVideo ? 'video ' : '';
    await notifyUsers([patientId], {
      type: 'appointment', title: 'Appointment booked',
      message: `Your ${kind}appointment on ${when} was booked.`, link: '/patient/history',
    });
    await notifyUsers([doc && doc.user_id], {
      type: 'appointment', title: 'New appointment',
      message: `A patient booked a ${kind}appointment on ${when}.`, link: '/doctor/appointments',
    });
  } catch (err) {
    console.error('booking notification failed:', err.message);
  }
}

module.exports = { notifyUsers, notifyRoles, notifyBooking };
