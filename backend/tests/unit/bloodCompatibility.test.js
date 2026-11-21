const {
  compatibleDonorGroups: cdg, computeExpiry, SHELF_LIFE_DAYS, DONATION_INTERVAL_DAYS, LOW_STOCK_THRESHOLD,
} = require('../../utils/bloodCompatibility');

const RED = {
  'O-': ['O-'], 'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'], 'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'], 'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'], 'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};
const PLASMA = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'], 'O+': ['O+', 'O-', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'], 'A+': ['A+', 'A-', 'AB-', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'], 'B+': ['B+', 'B-', 'AB-', 'AB+'],
  'AB-': ['AB-', 'AB+'], 'AB+': ['AB+', 'AB-'],
};
const sorted = (a) => [...a].sort();

describe('compatibleDonorGroups', () => {
  test.each(Object.entries(RED))('red cells for %s', (rec, expected) => {
    for (const comp of ['whole_blood', 'packed_rbc']) {
      expect(sorted(cdg(rec, comp))).toEqual(sorted(expected));
      expect(cdg(rec, comp)[0]).toBe(rec);
    }
  });
  test.each(Object.entries(PLASMA))('plasma for %s (Rh ignored)', (rec, expected) => {
    expect(sorted(cdg(rec, 'plasma'))).toEqual(sorted(expected));
    expect(cdg(rec, 'plasma')[0]).toBe(rec);
  });
  test.each(Object.keys(RED))('platelets for %s = plasma ABO + red cell Rh', (rec) => {
    const expected = PLASMA[rec].filter((g) => !(rec.endsWith('-') && g.endsWith('+')));
    expect(sorted(cdg(rec, 'platelets'))).toEqual(sorted(expected));
    expect(cdg(rec, 'platelets')[0]).toBe(rec);
  });
  test('O- is the universal red cell donor, AB+ the universal red cell recipient', () => {
    for (const rec of Object.keys(RED)) expect(cdg(rec, 'packed_rbc')).toContain('O-');
    expect(cdg('AB+', 'packed_rbc')).toHaveLength(8);
  });
  test('AB is the universal plasma donor', () => {
    for (const rec of Object.keys(PLASMA)) {
      expect(cdg(rec, 'plasma')).toEqual(expect.arrayContaining(['AB+', 'AB-']));
    }
  });
});

describe('computeExpiry', () => {
  test.each(Object.entries(SHELF_LIFE_DAYS))('%s shelf life', (comp) => {
    const out = computeExpiry('2026-01-01', comp);
    expect((Date.parse(out) - Date.parse('2026-01-01')) / 86400000).toBe(SHELF_LIFE_DAYS[comp]);
  });
  test('month/year/leap rollover without timezone drift', () => {
    expect(computeExpiry('2026-02-01', 'whole_blood')).toBe('2026-03-08');
    expect(computeExpiry('2026-12-30', 'platelets')).toBe('2027-01-04');
    expect(computeExpiry('2027-12-31', 'plasma')).toBe('2028-12-30');
  });
  test('constants', () => {
    expect(DONATION_INTERVAL_DAYS).toBe(56);
    expect(LOW_STOCK_THRESHOLD).toBe(5);
  });
});
