import { format } from 'date-fns';

// mysql2 returns DATE columns as UTC ISO datetimes (e.g. 2026-11-21T18:30:00.000Z for an IST date),
// so render the LOCAL calendar date, which gives back the stored one. Never slice the ISO string.
export const formatDbDate = (value: string | null | undefined): string => {
  if (!value) return '-';
  // A bare YYYY-MM-DD (e.g. the donation response's expiresOn) is already a calendar date: parse it as local.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return format(m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value), 'dd MMM yyyy');
};

// Local YYYY-MM-DD for date inputs / request bodies.
export const localDateInput = (d: Date = new Date()): string => format(d, 'yyyy-MM-dd');
