import { describe, it, expect } from 'vitest';
import { formatDbDate, localDateInput, hasStarted } from './dates';

describe('dates', () => {
  it('renders the local calendar date of the UTC instant mysql2 produces', () => {
    // A local-midnight date serialised to UTC ISO (what mysql2 does) must come back as the same calendar date in any TZ.
    expect(formatDbDate(new Date(2026, 10, 22).toISOString())).toBe('22 Nov 2026');
  });
  it('keeps a bare date-only string on the same calendar day', () => {
    expect(formatDbDate('2026-12-26')).toBe('26 Dec 2026');
  });
  it('handles empty values', () => {
    expect(formatDbDate(null)).toBe('-');
    expect(formatDbDate(undefined)).toBe('-');
    expect(formatDbDate('garbage')).toBe('-');
  });
  it('formats a local YYYY-MM-DD', () => {
    expect(localDateInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('hasStarted', () => {
  const now = new Date(2030, 0, 15, 10, 0, 0); // local 10:00
  it.each([
    ['2030-01-15', '10:16:00', false], // 16 min ahead
    ['2030-01-15', '10:15:00', true], // the room opens 15 min early
    ['2030-01-15', '09:00:00', true],
    ['2030-01-16', '09:00:00', false], // tomorrow
  ])('%s %s -> %s', (date, time, expected) => {
    expect(hasStarted(date, time, now)).toBe(expected);
  });
  it('reads a DB date that arrives as a UTC ISO string (IST midnight)', () => {
    const isoForLocalDay = new Date(2030, 0, 15).toISOString();
    expect(hasStarted(isoForLocalDay, '09:00:00', now)).toBe(true);
    expect(hasStarted(isoForLocalDay, '11:00:00', now)).toBe(false);
  });
});
