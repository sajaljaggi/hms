import { describe, it, expect } from 'vitest';
import { formatDbDate, localDateInput } from './dates';

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
  });
  it('formats a local YYYY-MM-DD', () => {
    expect(localDateInput(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
