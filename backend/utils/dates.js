// mysql2 returns DATE columns as JS Date objects by default. Converting via
// toISOString() would shift to UTC first, which can roll the date backward
// for users east of UTC (e.g. IST) near midnight — so this reads the local
// date components instead.
function toDateStr(date) {
  if (date instanceof Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(date).split('T')[0];
}

// Video join window: 15 min before the slot start until 60 min after. Slots are local DATE + TIME.
function isWithinJoinWindow(slotDateStr, slotTimeStr, now = new Date()) {
  const start = new Date(`${slotDateStr}T${slotTimeStr}`).getTime();
  const t = now.getTime();
  return t >= start - 15 * 60000 && t <= start + 60 * 60000;
}

module.exports = { toDateStr, isWithinJoinWindow };
